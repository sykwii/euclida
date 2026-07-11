$ErrorActionPreference = "Stop"

$path = "backend\src\service-orders\service-orders.service.ts"

if (-not (Test-Path $path)) {
    throw "File not found: $path"
}

$content = Get-Content $path -Raw -Encoding UTF8

$oldSignature = @'
  async complete(
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
'@

$legacySignature = @'
  private async completeLegacy(
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
'@

if (-not $content.Contains($oldSignature)) {
    throw "Original complete() signature not found. The file differs from the audited version."
}

$content = $content.Replace($oldSignature, $legacySignature)

$canonicalMethods = @'
  async complete(
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const order = await this.findOne(id, user);
    const shotConfigurationId =
      body.actualShotConfigurationId ?? order.selectedShotConfigurationId;

    if (shotConfigurationId) {
      return this.completeCanonical(id, body, user);
    }

    return this.completeLegacy(id, body, user);
  }

  private async completeCanonical(
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const startedAt = new Date(body.startedAt);
    const completedAt = new Date(body.completedAt);
    const shotQuantity = Number(body.actualQuantity);

    if (
      Number.isNaN(startedAt.getTime()) ||
      Number.isNaN(completedAt.getTime())
    ) {
      throw new BadRequestException('Некоректна дата початку або завершення');
    }

    if (completedAt < startedAt) {
      throw new BadRequestException(
        'Дата завершення не може бути раніше дати початку',
      );
    }

    if (!Number.isInteger(shotQuantity) || shotQuantity <= 0) {
      throw new BadRequestException(
        'Фактична кількість пострілів має бути цілим додатним числом',
      );
    }

    const savedOrder = await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(ServiceOrder, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!order) {
        throw new NotFoundException('Вогневе завдання не знайдено');
      }

      await this.ensureCanExecuteOrder(order, user);

      const isFirstCompletion = order.status === 'in_progress';
      const isEditingCompleted = order.status === 'completed';

      if (!isFirstCompletion && !isEditingCompleted) {
        throw new BadRequestException(
          'Завершити або редагувати можна тільки завдання в роботі чи завершене завдання',
        );
      }

      if (isEditingCompleted) {
        this.assertCanEdit(order);
      }

      if (!order.selectedFirePositionId) {
        throw new BadRequestException(
          'Неможливо завершити завдання без обраної ВП',
        );
      }

      const firePosition = await manager.findOne(FirePosition, {
        where: { id: order.selectedFirePositionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!firePosition?.ammoDepotId) {
        throw new BadRequestException('У вибраної ВП немає локального БК');
      }

      const configuration = await this.resolveShotConfigurationForCompletion(
        manager,
        firePosition,
        order,
        body,
      );

      if (
        !configuration.id ||
        !configuration.fuzeId ||
        !configuration.primerId ||
        !configuration.zoneId ||
        configuration.charges.length === 0
      ) {
        throw new BadRequestException(
          'Активний комплект пострілу повинен містити снаряд, підривник, капсуль, зону та щонайменше один заряд',
        );
      }

      const configurationEntity = await manager.findOne(ShotConfiguration, {
        where: { id: configuration.id },
      });

      if (!configurationEntity?.isActive) {
        throw new BadRequestException('Комплект пострілу неактивний');
      }

      const shellAdjustments = new Map<string, number>();
      const chargeAdjustments = new Map<string, number>();
      const fuzeAdjustments = new Map<string, number>();
      const primerAdjustments = new Map<string, number>();

      if (isEditingCompleted) {
        await this.restorePreviousCompletionState(
          manager,
          order,
          shellAdjustments,
          chargeAdjustments,
          fuzeAdjustments,
          primerAdjustments,
        );

        await manager.delete(StockMovement, {
          documentNumber: `VGZ-${order.id.slice(0, 8)}`,
          movementType: 'write_off',
        });
      }

      this.addStockAdjustment(
        shellAdjustments,
        configuration.shellId,
        -shotQuantity,
      );
      this.addStockAdjustment(
        fuzeAdjustments,
        configuration.fuzeId,
        -shotQuantity,
      );
      this.addStockAdjustment(
        primerAdjustments,
        configuration.primerId,
        -shotQuantity,
      );

      for (const component of configuration.charges) {
        this.addStockAdjustment(
          chargeAdjustments,
          component.chargeId,
          -(shotQuantity * component.quantityPerShot),
        );
      }

      await this.applyShellStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        shellAdjustments,
      );
      await this.applyChargeStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        chargeAdjustments,
      );
      await this.applyFuzeStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        fuzeAdjustments,
      );
      await this.applyPrimerStockAdjustments(
        manager,
        firePosition.ammoDepotId,
        primerAdjustments,
      );

      await manager.delete(ServiceOrderActualAmmo, { serviceOrderId: order.id });

      await this.saveActualShotConfigurationSnapshot(
        manager,
        order.id,
        configuration,
      );

      await this.writeShotConfigurationStockMovements(
        manager,
        firePosition.ammoDepotId,
        order.id,
        shotQuantity,
        configuration,
      );

      const totalChargeQuantity = configuration.charges.reduce(
        (sum, component) =>
          this.roundStockQuantity(
            sum + shotQuantity * component.quantityPerShot,
          ),
        0,
      );

      order.status = 'completed';
      order.startedAt = startedAt;
      order.completedAt = completedAt;
      order.actualQuantity = shotQuantity;
      order.actualChargeQuantity = totalChargeQuantity;
      order.actualChargeModulesPerShot = null;
      order.selectedShotConfigurationId = configuration.id;
      order.selectedShellId = configuration.shellId;
      order.selectedChargeId = configuration.charges[0]?.chargeId ?? null;
      order.selectedZoneId = configuration.zoneId;
      order.actualShotConfigurationSnapshot =
        this.buildShotConfigurationSnapshot(configuration);
      order.resultType = body.resultType;
      order.resultComment = body.resultComment?.trim() || null;
      order.completedByUserId = user.sub;

      const saved = await manager.save(ServiceOrder, order);

      if (isFirstCompletion) {
        firePosition.readinessStatus = 'ready';
        firePosition.completedVgzCount =
          Number(firePosition.completedVgzCount ?? 0) + 1;
        await manager.save(FirePosition, firePosition);
      }

      return saved;
    });

    await this.writeOrderEvent(
      savedOrder,
      user,
      'completed',
      'Заявку завершено',
    );

    this.notifyRealtime(savedOrder, 'completed', [
      'missions',
      'map',
      'stock',
      'analytics',
      'events',
    ]);

    return savedOrder;
  }

'@

$marker = $legacySignature

if (-not $content.Contains($marker)) {
    throw "Renamed completeLegacy() marker not found."
}

$content = $content.Replace($marker, $canonicalMethods + $marker)

Set-Content $path -Value $content -Encoding UTF8

Write-Host "Patched: $path"
Write-Host "Next: cd backend; npm run build"
