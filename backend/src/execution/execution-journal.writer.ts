import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { ServiceOrder } from '../service-orders/service-order.entity';
import type { ExecutionPipelineContext } from './execution-pipeline-context.type';
import { ExecutionRecordArtillery } from './execution-record-artillery.entity';
import { ExecutionRecordCharge } from './execution-record-charge.entity';
import { ExecutionRecord } from './execution-record.entity';

interface ExecutionJournalWriteResult {
  id: string;
  created: boolean;
}

@Injectable()
export class ExecutionJournalWriter {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ExecutionRecord)
    private readonly recordsRepository: Repository<ExecutionRecord>,
  ) {}

  async writeDraft(
    context: ExecutionPipelineContext,
  ): Promise<ExecutionJournalWriteResult> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const duplicate = await manager.findOne(ExecutionRecord, {
          where: { idempotencyKey: context.body.idempotencyKey },
        });

        if (duplicate) {
          if (duplicate.serviceOrderId !== context.serviceOrderId) {
            throw new ConflictException(
              'Ключ ідемпотентності вже використано для іншого ВГЗ',
            );
          }

          return { id: duplicate.id, created: false };
        }

        const lockedOrder = await manager.findOne(ServiceOrder, {
          where: { id: context.serviceOrderId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!lockedOrder) {
          throw new NotFoundException('ВГЗ не знайдено');
        }

        if (lockedOrder.status !== 'in_progress') {
          throw new BadRequestException(
            'Записи журналу можна додавати тільки до ВГЗ у статусі "В роботі"',
          );
        }

        const record = manager.create(ExecutionRecord, {
          serviceOrderId: context.serviceOrderId,
          idempotencyKey: context.body.idempotencyKey,
          executionType: context.body.executionType,
          purpose: context.body.purpose,
          result: context.body.result,
          startedAt: context.startedAt,
          completedAt: context.completedAt,
          executorType: context.body.executorType?.trim() || null,
          executorId: context.body.executorId ?? null,
          executorSnapshot: context.executorSnapshot,
          quantity: context.body.quantity,
          resourceSnapshot: context.resourceSnapshot,
          comment: context.body.comment?.trim() || null,
          createdByUserId: context.user.sub,
          status: 'draft',
          stockOperationId: null,
          postedAt: null,
          postedByUserId: null,
          reversalOfRecordId: null,
        });

        const saved = await manager.save(ExecutionRecord, record);

        if (context.artillerySnapshot) {
          const artillery = manager.create(ExecutionRecordArtillery, {
            executionRecordId: saved.id,
            compositionSource: context.artillerySnapshot.compositionSource,
            sourceShotConfigurationId:
              context.artillerySnapshot.sourceShotConfigurationId,
            weaponModelId: context.artillerySnapshot.weaponModelId,
            shellId: context.artillerySnapshot.shellId,
            fuzeId: context.artillerySnapshot.fuzeId,
            primerId: context.artillerySnapshot.primerId,
            zoneId: context.artillerySnapshot.zoneId,
            maxRangeM: context.artillerySnapshot.maxRangeM,
            compositionSnapshot:
              context.artillerySnapshot.compositionSnapshot,
          });

          await manager.save(ExecutionRecordArtillery, artillery);

          const charges = context.artillerySnapshot.charges.map((component) =>
            manager.create(ExecutionRecordCharge, {
              executionRecordId: saved.id,
              chargeId: component.chargeId,
              chargeNameSnapshot: component.chargeNameSnapshot,
              quantityPerShot: component.quantityPerShot,
              accountingUnit: component.accountingUnit,
              sortOrder: component.sortOrder,
            }),
          );

          await manager.save(ExecutionRecordCharge, charges);
        }

        return { id: saved.id, created: true };
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        const duplicate = await this.recordsRepository.findOne({
          where: { idempotencyKey: context.body.idempotencyKey },
        });

        if (duplicate) {
          if (duplicate.serviceOrderId !== context.serviceOrderId) {
            throw new ConflictException(
              'Ключ ідемпотентності вже використано для іншого ВГЗ',
            );
          }

          return { id: duplicate.id, created: false };
        }
      }

      throw error;
    }
  }

  async markPosted(
    manager: EntityManager,
    record: ExecutionRecord,
    stockOperationId: string,
    postedAt: Date,
    postedByUserId: string,
  ): Promise<ExecutionRecord> {
    record.status = 'posted';
    record.stockOperationId = stockOperationId;
    record.postedAt = postedAt;
    record.postedByUserId = postedByUserId;
    return manager.save(ExecutionRecord, record);
  }

  async replaceDraft(
    recordId: string,
    context: ExecutionPipelineContext,
  ): Promise<ExecutionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await manager.findOne(ExecutionRecord, {
        where: { id: recordId },
        relations: { artillery: { charges: true } },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        throw new NotFoundException('Запис журналу не знайдено');
      }

      if (record.status !== 'draft') {
        throw new BadRequestException('Редагувати можна тільки чернетку журналу');
      }

      record.executionType = context.body.executionType;
      record.purpose = context.body.purpose;
      record.result = context.body.result;
      record.startedAt = context.startedAt;
      record.completedAt = context.completedAt;
      record.executorType = context.body.executorType?.trim() || null;
      record.executorId = context.body.executorId ?? null;
      record.executorSnapshot = context.executorSnapshot;
      record.quantity = context.body.quantity;
      record.resourceSnapshot = context.resourceSnapshot;
      record.comment = context.body.comment?.trim() || null;

      const saved = await manager.save(ExecutionRecord, record);

      await manager.delete(ExecutionRecordCharge, { executionRecordId: record.id });
      await manager.delete(ExecutionRecordArtillery, { executionRecordId: record.id });

      if (context.artillerySnapshot) {
        const artillery = manager.create(ExecutionRecordArtillery, {
          executionRecordId: saved.id,
          compositionSource: context.artillerySnapshot.compositionSource,
          sourceShotConfigurationId:
            context.artillerySnapshot.sourceShotConfigurationId,
          weaponModelId: context.artillerySnapshot.weaponModelId,
          shellId: context.artillerySnapshot.shellId,
          fuzeId: context.artillerySnapshot.fuzeId,
          primerId: context.artillerySnapshot.primerId,
          zoneId: context.artillerySnapshot.zoneId,
          maxRangeM: context.artillerySnapshot.maxRangeM,
          compositionSnapshot:
            context.artillerySnapshot.compositionSnapshot,
        });

        await manager.save(ExecutionRecordArtillery, artillery);

        const charges = context.artillerySnapshot.charges.map((component) =>
          manager.create(ExecutionRecordCharge, {
            executionRecordId: saved.id,
            chargeId: component.chargeId,
            chargeNameSnapshot: component.chargeNameSnapshot,
            quantityPerShot: component.quantityPerShot,
            accountingUnit: component.accountingUnit,
            sortOrder: component.sortOrder,
          }),
        );

        await manager.save(ExecutionRecordCharge, charges);
      }

      return saved;
    });
  }

  async cancelDraft(recordId: string): Promise<ExecutionRecord> {
    return this.dataSource.transaction(async (manager) => {
      const record = await manager.findOne(ExecutionRecord, {
        where: { id: recordId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        throw new NotFoundException('Запис журналу не знайдено');
      }

      if (record.status !== 'draft') {
        throw new BadRequestException('Скасувати можна тільки чернетку журналу');
      }

      record.status = 'cancelled';
      return manager.save(ExecutionRecord, record);
    });
  }
}
