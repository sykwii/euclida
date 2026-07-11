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
import { EventLogsService } from '../event-logs/event-logs.service';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { StockEngineService } from '../stock-engine/stock-engine.service';
import type { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import type { ExecutionHandler } from './execution-handler.interface';
import type { ExecutionPipelineContext } from './execution-pipeline-context.type';
import { ExecutionConsumptionCalculator } from './execution-consumption.calculator';
import { ExecutionJournalWriter } from './execution-journal.writer';
import { ExecutionRecord } from './execution-record.entity';
import { ExecutionSnapshotBuilder } from './execution-snapshot.builder';

export const EXECUTION_HANDLERS = 'EXECUTION_HANDLERS';

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

    const handler = this.selectHandler(body.executionType);
    handler.validate(body);

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
        relations: {
          serviceOrder: {
            selectedFirePosition: true,
            selectedAirAssetPosition: true,
          },
          artillery: { charges: true },
        },
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

      const lockedOrder = await manager.findOne(ServiceOrder, {
        where: { id: lockedRecord.serviceOrderId },
        relations: {
          selectedFirePosition: true,
          selectedAirAssetPosition: true,
        },
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

      const context = this.buildContextFromRecord(
        {
          ...lockedRecord,
          serviceOrder: lockedOrder,
        },
        user,
      );

      if (!context.artillerySnapshot || context.executionType !== 'artillery') {
        throw new BadRequestException(
          'Проведення через склад зараз підтримується тільки для артилерійських записів',
        );
      }

      const ammoDepotId = this.resolveExecutorAmmoDepotId(lockedOrder);
      if (!ammoDepotId) {
        throw new BadRequestException(
          'Для проведення запису потрібен склад боєприпасів виконавця',
        );
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

  private buildContext(
    serviceOrderId: string,
    serviceOrder: ServiceOrder,
    body: CreateExecutionRecordDto,
    user: AuthUser,
    handler: ExecutionHandler,
  ): ExecutionPipelineContext {
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
