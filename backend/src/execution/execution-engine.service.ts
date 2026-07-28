import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { EventLogsService } from '../event-logs/event-logs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { ShotConfiguration } from '../shot-configurations/shot-configuration.entity';
import { StockEngineService } from '../stock-engine/stock-engine.service';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { getActiveMaintenance } from '../weapon-systems/weapon-maintenance-state';
import type { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import type { ExecutionHandler } from './execution-handler.interface';
import type { ExecutionPipelineContext } from './execution-pipeline-context.type';
import { ExecutionConsumptionCalculator } from './execution-consumption.calculator';
import { ExecutionJournalWriter } from './execution-journal.writer';
import { ExecutionRecord } from './execution-record.entity';
import { ExecutionSnapshotBuilder } from './execution-snapshot.builder';

export const EXECUTION_HANDLERS = 'EXECUTION_HANDLERS';

export interface ExecutionValidationReason {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ExecutionValidationResult {
  valid: boolean;
  reasons: ExecutionValidationReason[];
  requirements: Array<{
    resourceType: string;
    resourceId: string;
    required: number;
    available: number;
    accountingUnit?: string;
  }>;
}

@Injectable()
export class ExecutionEngineService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ExecutionRecord)
    private readonly recordsRepository: Repository<ExecutionRecord>,
    @InjectRepository(ServiceOrder)
    private readonly serviceOrdersRepository: Repository<ServiceOrder>,
    private readonly accessScope: AccessScopeService,
    @Inject(EXECUTION_HANDLERS)
    private readonly handlers: ExecutionHandler[],
    private readonly snapshotBuilder: ExecutionSnapshotBuilder,
    private readonly consumptionCalculator: ExecutionConsumptionCalculator,
    private readonly journalWriter: ExecutionJournalWriter,
    private readonly stockEngine: StockEngineService,
    private readonly eventLogs: EventLogsService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async findByServiceOrder(
    serviceOrderId: string,
    user: AuthUser,
  ): Promise<ExecutionRecord[]> {
    const order = await this.loadAccessibleOrder(serviceOrderId, user);

    return this.recordsRepository.find({
      where: { serviceOrderId: order.id },
      relations: {
        artillery: true,
      },
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    serviceOrderId: string,
    body: CreateExecutionRecordDto,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    const order = await this.loadAccessibleOrder(serviceOrderId, user);
    const existing = await this.recordsRepository.findOne({
      where: { idempotencyKey: body.idempotencyKey },
      relations: { artillery: { charges: true } },
    });

    if (existing) {
      if (existing.serviceOrderId !== serviceOrderId) {
        throw new ConflictException(
          'Ключ ідемпотентності вже використано для іншого ВГЗ',
        );
      }

      return existing;
    }

    if (order.status !== 'in_progress') {
      throw new BadRequestException(
        'Записи журналу можна додавати тільки до ВГЗ у статусі "В роботі"',
      );
    }

    body.purpose = this.normalizePurpose(body.purpose);
    const handler = this.selectHandler(body.executionType);
    handler.validate(body);

    this.ensureDeviationComment(order, body);

    const context = this.buildContext(
      serviceOrderId,
      order,
      body,
      user,
      handler,
    );

    await this.applyStockIfActivated(context);

    const result = await this.journalWriter.writeDraft(context);
    const saved = await this.recordsRepository.findOne({
      where: { id: result.id },
      relations: { artillery: { charges: true } },
    });

    if (!saved) {
      throw new NotFoundException('Запис журналу не знайдено після створення');
    }

    if (!result.created) {
      return saved;
    }

    await this.eventLogs.create({
      eventType: 'execution',
      action: 'created',
      actor: user,
      unitId: context.unitId,
      entityType: 'execution_record',
      entityId: saved.id,
      entityName: order.orderNumber,
      title: 'Додано запис до журналу виконання ВГЗ',
      details: `${body.executionType}: ${body.purpose}, кількість ${body.quantity}`,
      metadata: {
        serviceOrderId,
        executionType: body.executionType,
        purpose: body.purpose,
        result: body.result,
        idempotencyKey: body.idempotencyKey,
      },
    });

    this.realtimeEvents.emitMany(
      ['missions', 'analytics', 'events'],
      'created',
      {
        entity: 'execution_record',
        id: saved.id,
        unitId: context.unitId ?? undefined,
        reason: 'execution_record_created',
      },
    );

    return saved;
  }

  async post(
    recordId: string,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    const accessibleRecord = await this.loadAccessibleRecord(recordId, user);
    const postResult = await this.dataSource.transaction(async (manager) => {
      const lockedRecord = await manager.findOne(ExecutionRecord, {
        where: { id: recordId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedRecord) {
        throw new NotFoundException('Запис журналу не знайдено');
      }

      if (lockedRecord.status === 'posted') {
        return { record: lockedRecord, created: false };
      }

      if (lockedRecord.status !== 'draft') {
        throw new BadRequestException(
          'Можна проводити тільки чернетку журналу виконання',
        );
      }

      const recordWithRelations = await manager.findOne(ExecutionRecord, {
        where: { id: lockedRecord.id },
        relations: {
          serviceOrder: {
            selectedFirePosition: true,
            selectedAirAssetPosition: true,
          },
          artillery: { charges: true },
        },
      });

      if (!recordWithRelations) {
        throw new NotFoundException('Р—Р°РїРёСЃ Р¶СѓСЂРЅР°Р»Сѓ РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
      }

      const lockedOrder = await manager.findOne(ServiceOrder, {
        where: { id: lockedRecord.serviceOrderId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!lockedOrder) {
        throw new NotFoundException('ВГЗ не знайдено');
      }

      if (lockedOrder.status !== 'in_progress') {
        throw new BadRequestException(
          'Проведення журналу доступне тільки для ВГЗ у статусі "В роботі"',
        );
      }

      const orderWithRelations = await manager.findOne(ServiceOrder, {
        where: { id: lockedOrder.id },
        relations: {
          selectedFirePosition: true,
          selectedAirAssetPosition: true,
        },
      });

      if (!orderWithRelations) {
        throw new NotFoundException('Р’Р“Р— РЅРµ Р·РЅР°Р№РґРµРЅРѕ');
      }

      const context = this.buildContextFromRecord(
        {
          ...recordWithRelations,
          serviceOrder: orderWithRelations,
        },
        user,
      );

      if (!context.artillerySnapshot || context.executionType !== 'artillery') {
        throw new BadRequestException(
          'Проведення через склад зараз підтримується тільки для артилерійських записів',
        );
      }

      const ammoDepotId = this.resolveExecutorAmmoDepotId(orderWithRelations);
      if (!ammoDepotId) {
        throw new BadRequestException(
          'Для проведення запису потрібен склад боєприпасів виконавця',
        );
      }

      const validation = await this.validatePreFireContext(context, ammoDepotId);
      if (!validation.valid) {
        throw new BadRequestException({
          message: 'Запис журналу не пройшов передвогневу перевірку',
          reasons: validation.reasons,
          requirements: validation.requirements,
        });
      }

    const stockOperation = await this.stockEngine.execute(
      {
        idempotencyKey: `execution:${lockedRecord.id}`,
        operationType: 'write_off',
        movementType: 'execution_post',
        source: { type: 'depot', id: ammoDepotId },
        destination: null,
        comment: lockedRecord.comment,
        reason: 'execution_record_posted',
        unitId: context.unitId,
          resources: context.consumption,
        },
        user,
      );

      const postedAt = new Date();
      const record = await this.journalWriter.markPosted(
        manager,
        lockedRecord,
        stockOperation.id,
        postedAt,
        user.sub,
      );

      return { record, created: true };
    });

    const saved = await this.recordsRepository.findOne({
      where: { id: postResult.record.id },
      relations: { artillery: { charges: true } },
    });

    if (!saved) {
      throw new NotFoundException('Запис журналу не знайдено після проведення');
    }

    if (!postResult.created || saved.status !== 'posted') {
      return saved;
    }

    const context = this.buildContextFromRecord(
      {
        ...accessibleRecord,
        status: saved.status,
        stockOperationId: saved.stockOperationId,
        postedAt: saved.postedAt,
        postedByUserId: saved.postedByUserId,
        serviceOrder: accessibleRecord.serviceOrder,
      },
      user,
    );

    await this.eventLogs.create({
      eventType: 'execution',
      action: 'posted',
      actor: user,
      unitId: context.unitId,
      entityType: 'execution_record',
      entityId: saved.id,
      entityName: context.serviceOrder.orderNumber,
      title: 'Проведено запис журналу виконання ВГЗ',
      details: `${saved.executionType}: ${saved.purpose}, кількість ${saved.quantity}`,
      metadata: {
        serviceOrderId: saved.serviceOrderId,
        stockOperationId: saved.stockOperationId,
        postedAt: saved.postedAt?.toISOString() ?? null,
      },
    });

    this.realtimeEvents.emitMany(
      ['missions', 'analytics', 'events', 'stock'],
      'updated',
      {
        entity: 'execution_record',
        id: saved.id,
        unitId: context.unitId ?? undefined,
        reason: 'execution_record_posted',
      },
    );

    return saved;
  }

  async validateRecord(
    recordId: string,
    user: AuthUser,
  ): Promise<ExecutionValidationResult> {
    const record = await this.loadAccessibleRecord(recordId, user);
    const context = this.buildContextFromRecord(record, user);
    const ammoDepotId = this.resolveExecutorAmmoDepotId(record.serviceOrder);

    if (!ammoDepotId) {
      return {
        valid: false,
        reasons: [
          {
            code: 'ammo_depot_missing',
            message: 'Для виконавця не визначено склад боєприпасів',
          },
        ],
        requirements: [],
      };
    }

    return this.validatePreFireContext(context, ammoDepotId);
  }

  async updateDraft(
    recordId: string,
    body: CreateExecutionRecordDto,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    const current = await this.loadAccessibleRecord(recordId, user);
    if (current.status !== 'draft') {
      throw new BadRequestException('Редагувати можна тільки чернетку журналу');
    }

    body.purpose = this.normalizePurpose(body.purpose);
    const handler = this.selectHandler(body.executionType);
    handler.validate(body);
    this.ensureDeviationComment(current.serviceOrder, body);

    const context = this.buildContext(
      current.serviceOrderId,
      current.serviceOrder,
      body,
      user,
      handler,
    );

    await this.journalWriter.replaceDraft(recordId, context);
    const saved = await this.recordsRepository.findOne({
      where: { id: recordId },
      relations: { artillery: { charges: true } },
    });

    if (!saved) {
      throw new NotFoundException('Запис журналу не знайдено після оновлення');
    }

    this.realtimeEvents.emitMany(['missions', 'analytics', 'events'], 'updated', {
      entity: 'execution_record',
      id: saved.id,
      unitId: this.resolveOrderUnitId(current.serviceOrder) ?? undefined,
      reason: 'execution_record_updated',
    });

    return saved;
  }

  async cancelDraft(recordId: string, user: AuthUser): Promise<ExecutionRecord> {
    const current = await this.loadAccessibleRecord(recordId, user);
    if (current.status !== 'draft') {
      throw new BadRequestException('Скасувати можна тільки чернетку журналу');
    }

    const saved = await this.journalWriter.cancelDraft(recordId);
    this.realtimeEvents.emitMany(['missions', 'analytics', 'events'], 'updated', {
      entity: 'execution_record',
      id: saved.id,
      unitId: this.resolveOrderUnitId(current.serviceOrder) ?? undefined,
      reason: 'execution_record_cancelled',
    });

    return saved;
  }

  private buildContext(
    serviceOrderId: string,
    serviceOrder: ServiceOrder,
    body: CreateExecutionRecordDto,
    user: AuthUser,
    handler: ExecutionHandler,
  ): ExecutionPipelineContext {
    body.purpose = this.normalizePurpose(body.purpose);
    const context: ExecutionPipelineContext = {
      serviceOrderId,
      serviceOrder,
      body,
      user,
      handler,
      unitId: this.resolveOrderUnitId(serviceOrder),
      startedAt: new Date(body.startedAt),
      completedAt: body.completedAt ? new Date(body.completedAt) : null,
      executorSnapshot: this.snapshotBuilder.buildExecutorSnapshot(body),
      resourceSnapshot: this.snapshotBuilder.buildResourceSnapshot(body),
      artillerySnapshot: handler.buildArtillerySnapshot(body),
      consumption: [],
      stockOperation: null,
      existingRecord: null,
    };

    context.consumption = this.consumptionCalculator.calculate(context);
    return context;
  }

  private async applyStockIfActivated(
    context: ExecutionPipelineContext,
  ): Promise<void> {
    if (!this.shouldApplyStock(context)) {
      return;
    }

    context.stockOperation = await this.stockEngine.execute(
      {
        idempotencyKey: context.body.idempotencyKey,
        operationType: 'write_off',
        movementType: 'execution_consumption',
        source: null,
        destination: null,
        comment: context.body.comment?.trim() || null,
        reason: 'execution_record_created',
        unitId: context.unitId,
        resources: context.consumption,
      },
      context.user,
    );
  }

  private shouldApplyStock(_context: ExecutionPipelineContext): boolean {
    return false;
  }

  private buildContextFromRecord(
    record: ExecutionRecord,
    user: AuthUser,
  ): ExecutionPipelineContext & { executionType: ExecutionRecord['executionType'] } {
    const artillerySnapshot = record.artillery
      ? {
          compositionSource: record.artillery.compositionSource,
          sourceShotConfigurationId:
            record.artillery.sourceShotConfigurationId,
          weaponModelId: record.artillery.weaponModelId,
          shellId: record.artillery.shellId,
          fuzeId: record.artillery.fuzeId,
          primerId: record.artillery.primerId,
          zoneId: record.artillery.zoneId,
          maxRangeM: record.artillery.maxRangeM,
          compositionSnapshot: record.artillery.compositionSnapshot,
          charges: (record.artillery.charges ?? []).map((item) => ({
            chargeId: item.chargeId,
            chargeNameSnapshot: item.chargeNameSnapshot,
            quantityPerShot: item.quantityPerShot,
            accountingUnit: item.accountingUnit,
            sortOrder: item.sortOrder,
          })),
        }
      : null;

    const context: ExecutionPipelineContext & {
      executionType: ExecutionRecord['executionType'];
    } = {
      serviceOrderId: record.serviceOrderId,
      serviceOrder: record.serviceOrder,
      body: {
        idempotencyKey: record.idempotencyKey,
        executionType: record.executionType,
        purpose: record.purpose,
        result: record.result,
        startedAt: record.startedAt.toISOString(),
        completedAt: record.completedAt?.toISOString(),
        executorType: record.executorType ?? undefined,
        executorId: record.executorId ?? undefined,
        executorSnapshot: record.executorSnapshot,
        quantity: record.quantity,
        resourceSnapshot: record.resourceSnapshot,
        comment: record.comment ?? undefined,
        artillery: artillerySnapshot
          ? {
              compositionSource: artillerySnapshot.compositionSource,
              sourceShotConfigurationId:
                artillerySnapshot.sourceShotConfigurationId ?? undefined,
              weaponModelId: artillerySnapshot.weaponModelId,
              shellId: artillerySnapshot.shellId,
              fuzeId: artillerySnapshot.fuzeId,
              primerId: artillerySnapshot.primerId,
              zoneId: artillerySnapshot.zoneId,
              maxRangeM: artillerySnapshot.maxRangeM,
              compositionSnapshot: artillerySnapshot.compositionSnapshot,
              charges: artillerySnapshot.charges.map((component) => ({
                chargeId: component.chargeId,
                chargeName: component.chargeNameSnapshot,
                quantityPerShot: component.quantityPerShot,
                accountingUnit: component.accountingUnit,
                sortOrder: component.sortOrder,
              })),
            }
          : undefined,
      },
      user,
      handler: this.selectHandler(record.executionType),
      unitId: this.resolveOrderUnitId(record.serviceOrder),
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      executorSnapshot: record.executorSnapshot,
      resourceSnapshot: record.resourceSnapshot,
      artillerySnapshot,
      consumption: [],
      stockOperation: record.stockOperation ?? null,
      existingRecord: record,
      executionType: record.executionType,
    };

    context.consumption = this.consumptionCalculator.calculate(context);
    return context;
  }

  private async validatePreFireContext(
    context: ExecutionPipelineContext,
    ammoDepotId: string,
  ): Promise<ExecutionValidationResult> {
    const reasons: ExecutionValidationReason[] = [];
    const requirements = await this.getStockRequirements(ammoDepotId, context);
    const order = context.serviceOrder;

    if (order.status !== 'in_progress') {
      reasons.push({
        code: 'service_order_not_in_progress',
        message: 'ВГЗ має бути у статусі "в роботі"',
        details: { status: order.status },
      });
    }

    if (typeof this.dataSource.getRepository !== 'function') {
      return { valid: reasons.length === 0, reasons, requirements };
    }

    if (!order.selectedFirePositionId || !order.selectedFirePosition) {
      reasons.push({
        code: 'fire_position_missing',
        message: 'Для ВГЗ не обрано ВП',
      });
    } else {
      const fpStatus = this.normalizeReadiness(order.selectedFirePosition.readinessStatus);
      if (fpStatus !== 'combat_ready') {
        reasons.push({
          code: 'fire_position_not_ready',
          message: 'Обрана ВП не БГ',
          details: {
            firePositionId: order.selectedFirePositionId,
            readinessStatus: order.selectedFirePosition.readinessStatus,
            reason: order.selectedFirePosition.notReadyReason,
          },
        });
      }
    }

    const weapon = order.selectedFirePositionId
      ? await this.dataSource.getRepository(WeaponSystem).findOne({
          where: [
            {
              currentFirePositionId: order.selectedFirePositionId,
              deploymentStatus: 'at_fire_position',
            },
            {
              firePositionId: order.selectedFirePositionId,
              locationType: 'fire_position',
            },
          ],
        })
      : null;

    if (!weapon) {
      reasons.push({
        code: 'weapon_missing_on_fire_position',
        message: 'На обраній ВП немає СГ',
        details: { firePositionId: order.selectedFirePositionId },
      });
    } else {
      if (this.normalizeReadiness(weapon.readinessStatus) !== 'combat_ready') {
        reasons.push({
          code: 'weapon_not_ready',
          message: 'СГ не БГ',
          details: {
            weaponSystemId: weapon.id,
            readinessStatus: weapon.readinessStatus,
            reason: weapon.notReadyReason,
          },
        });
      }

      if (
        weapon.deploymentStatus !== 'at_fire_position' ||
        weapon.currentFirePositionId !== order.selectedFirePositionId
      ) {
        reasons.push({
          code: 'weapon_not_on_selected_fire_position',
          message: 'СГ фізично не перебуває на обраній ВП',
          details: {
            weaponSystemId: weapon.id,
            deploymentStatus: weapon.deploymentStatus,
            currentFirePositionId: weapon.currentFirePositionId,
            selectedFirePositionId: order.selectedFirePositionId,
          },
        });
      }

      if (await getActiveMaintenance(this.dataSource, weapon.id)) {
        reasons.push({
          code: 'weapon_active_maintenance',
          message: 'Для СГ активне ТО або ремонт',
          details: { weaponSystemId: weapon.id },
        });
      }
    }

    if (context.artillerySnapshot && order.selectedFirePosition) {
      if (context.artillerySnapshot.sourceShotConfigurationId) {
        const kit = await this.dataSource.getRepository(ShotConfiguration).findOne({
          where: { id: context.artillerySnapshot.sourceShotConfigurationId },
          relations: { charges: true },
        });

        if (!kit || !kit.isActive || !kit.fuzeId || !kit.primerId || !kit.zoneNumber) {
          reasons.push({
            code: 'shot_kit_not_active_or_incomplete',
            message: 'Комплект пострілу неактивний або неповний',
            details: { shotConfigurationId: context.artillerySnapshot.sourceShotConfigurationId },
          });
        }
      }

      const distanceM = Math.ceil(
        this.distanceM(
          order.selectedFirePosition.lat,
          order.selectedFirePosition.lng,
          order.targetLat,
          order.targetLng,
        ),
      );

      if (distanceM > Number(context.artillerySnapshot.maxRangeM)) {
        reasons.push({
          code: 'target_out_of_range',
          message: 'Ціль поза максимальною дальністю комплекту',
          details: {
            distanceM,
            maxRangeM: context.artillerySnapshot.maxRangeM,
          },
        });
      }
    }

    for (const item of requirements) {
      if (item.available < item.required) {
        reasons.push({
          code: 'insufficient_stock',
          message: 'Недостатньо компонента на ВП',
          details: item,
        });
      }
    }

    return { valid: reasons.length === 0, reasons, requirements };
  }

  private async getStockRequirements(
    ammoDepotId: string,
    context: ExecutionPipelineContext,
  ): Promise<ExecutionValidationResult['requirements']> {
    const requirements: ExecutionValidationResult['requirements'] = [];

    for (const item of context.consumption) {
      requirements.push({
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        required: Number(item.quantity),
        available: await this.getAvailableQuantity(
          ammoDepotId,
          item.resourceType,
          item.resourceId,
        ),
        accountingUnit: item.accountingUnit,
      });
    }

    return requirements;
  }

  private async getAvailableQuantity(
    depotId: string,
    resourceType: string,
    resourceId: string,
  ): Promise<number> {
    if (typeof this.dataSource.getRepository !== 'function') {
      return Number.POSITIVE_INFINITY;
    }

    if (resourceType === 'shell') {
      const stock = await this.dataSource.getRepository(DepotShellStock).findOne({
        where: { depotId, shellId: resourceId },
      });
      return Number(stock?.quantity ?? 0);
    }

    if (resourceType === 'charge') {
      const stock = await this.dataSource.getRepository(DepotChargeStock).findOne({
        where: { depotId, chargeId: resourceId },
      });
      return Number(stock?.quantity ?? 0);
    }

    if (resourceType === 'fuze') {
      const stock = await this.dataSource.getRepository(DepotFuzeStock).findOne({
        where: { depotId, fuzeId: resourceId },
      });
      return Number(stock?.quantity ?? 0);
    }

    if (resourceType === 'primer') {
      const stock = await this.dataSource.getRepository(DepotPrimerStock).findOne({
        where: { depotId, primerId: resourceId },
      });
      return Number(stock?.quantity ?? 0);
    }

    return 0;
  }

  private normalizePurpose(value: ExecutionRecord['purpose'] | string): ExecutionRecord['purpose'] {
    if (value === 'main') return 'main_fire';
    if (value === 'warmup') return 'barrel_warmup';
    if (value === 'calibration' || value === 'test') return 'other';
    return value as ExecutionRecord['purpose'];
  }

  private ensureDeviationComment(
    order: ServiceOrder,
    body: CreateExecutionRecordDto,
  ): void {
    if (Number(body.quantity) > Number(order.plannedQuantity ?? 0) && !body.comment?.trim()) {
      throw new BadRequestException({
        message: 'Фактична кількість більша за планову. Потрібен коментар відхилення',
        reasons: [
          {
            code: 'deviation_comment_required',
            message: 'Для перевищення плану потрібно вказати коментар',
            details: {
              plannedQuantity: Number(order.plannedQuantity ?? 0),
              actualQuantity: Number(body.quantity),
            },
          },
        ],
      });
    }
  }

  private normalizeReadiness(value: string | null | undefined): 'combat_ready' | 'not_combat_ready' {
    return value === 'combat_ready' || value === 'ready' || value === 'ready_for_combat'
      ? 'combat_ready'
      : 'not_combat_ready';
  }

  private distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earthRadiusM = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }

  private resolveExecutorAmmoDepotId(order: ServiceOrder): string | null {
    if (order.executorType === 'fire_position') {
      return order.selectedFirePosition?.ammoDepotId ?? null;
    }

    return null;
  }

  private selectHandler(
    type: CreateExecutionRecordDto['executionType'],
  ): ExecutionHandler {
    const handler = this.handlers.find((candidate) => candidate.supports(type));

    if (!handler) {
      throw new BadRequestException(`Непідтримуваний тип виконання: ${type}`);
    }

    return handler;
  }

  private async loadAccessibleOrder(
    id: string,
    user: AuthUser,
  ): Promise<ServiceOrder> {
    const order = await this.serviceOrdersRepository.findOne({
      where: { id },
      relations: {
        selectedFirePosition: true,
        selectedAirAssetPosition: true,
      },
    });

    if (!order) {
      throw new NotFoundException('ВГЗ не знайдено');
    }

    const unitId = this.resolveOrderUnitId(order);

    if (user.role !== 'admin' && user.scope !== 'main') {
      if (!unitId || !(await this.accessScope.canAccessUnit(user, unitId))) {
        throw new ForbiddenException('Немає доступу до журналу цього ВГЗ');
      }
    }

    return order;
  }

  private async loadAccessibleRecord(
    id: string,
    user: AuthUser,
  ): Promise<ExecutionRecord> {
    const record = await this.recordsRepository.findOne({
      where: { id },
      relations: {
        serviceOrder: {
          selectedFirePosition: true,
          selectedAirAssetPosition: true,
        },
        artillery: {
          charges: true,
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Запис журналу не знайдено');
    }

    const unitId = this.resolveOrderUnitId(record.serviceOrder);

    if (user.role !== 'admin' && user.scope !== 'main') {
      if (!unitId || !(await this.accessScope.canAccessUnit(user, unitId))) {
        throw new ForbiddenException('Немає доступу до цього запису журналу');
      }
    }

    return record;
  }

  private resolveOrderUnitId(order: ServiceOrder): string | null {
    return (
      order.assignedUnitId ??
      order.selectedFirePosition?.unitId ??
      order.selectedAirAssetPosition?.unitId ??
      null
    );
  }
}
