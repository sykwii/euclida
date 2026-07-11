import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { ExecutionEngineService } from './execution-engine.service';
import type { ExecutionRecord } from './execution-record.entity';

describe('ExecutionEngineService', () => {
  const user: AuthUser = {
    sub: 'user-1',
    login: 'tester',
    role: 'operator',
    scope: 'main',
    fullName: 'Tester',
    unitId: 'unit-1',
  };

  function createService(options?: {
    record?: ExecutionRecord | null;
    stockExecute?: jest.Mock;
    transactionImpl?: jest.Mock;
  }) {
    const record = options?.record ?? null;
    const recordsRepository = {
      findOne: jest.fn().mockImplementation(async (query: { where?: { id?: string; idempotencyKey?: string } }) => {
        if (query.where?.id) {
          return record;
        }

        return record;
      }),
      find: jest.fn(),
    };
    const serviceOrdersRepository = {
      findOne: jest.fn().mockResolvedValue(
        record?.serviceOrder ?? {
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'in_progress',
          executorType: 'fire_position',
          assignedUnitId: 'unit-1',
          selectedFirePosition: { ammoDepotId: 'depot-1', unitId: 'unit-1' },
          selectedAirAssetPosition: null,
        },
      ),
    };
    const accessScope = {
      canAccessUnit: jest.fn().mockResolvedValue(true),
    };
    const handler = {
      supports: jest.fn().mockReturnValue(true),
      validate: jest.fn(),
      buildArtillerySnapshot: jest.fn().mockReturnValue(
        record?.artillery
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
              charges: record.artillery.charges,
            }
          : null,
      ),
    };
    const snapshotBuilder = {
      buildExecutorSnapshot: jest.fn().mockReturnValue({}),
      buildResourceSnapshot: jest.fn().mockReturnValue({}),
    };
    const calculator = {
      calculate: jest.fn().mockReturnValue([
        {
          resourceType: 'shell',
          resourceId: 'shell-1',
          quantity: 2,
          accountingUnit: 'piece',
        },
        {
          resourceType: 'charge',
          resourceId: 'charge-1',
          quantity: 4,
          accountingUnit: 'module',
        },
      ]),
    };
    const journalWriter = {
      writeDraft: jest.fn(),
      markPosted: jest.fn().mockImplementation(
        async (
          _manager: unknown,
          lockedRecord: ExecutionRecord,
          stockOperationId: string,
          postedAt: Date,
          postedByUserId: string,
        ) => ({
          ...lockedRecord,
          status: 'posted',
          stockOperationId,
          postedAt,
          postedByUserId,
        }),
      ),
    };
    const stockEngine = {
      execute:
        options?.stockExecute ??
        jest.fn().mockResolvedValue({ id: 'stock-op-1', movementGroupId: 'group-1' }),
    };
    const eventLogs = {
      create: jest.fn(),
    };
    const realtimeEvents = {
      emitMany: jest.fn(),
    };
    const dataSource = {
      transaction:
        options?.transactionImpl ??
        jest.fn().mockImplementation(async (callback: (manager: unknown) => Promise<unknown>) =>
          callback({
            findOne: jest.fn().mockImplementation(async (entity: unknown, query: { where: { id: string } }) => {
              const name = (entity as { name?: string }).name;
              if (name === 'ExecutionRecord') {
                return record;
              }

              if (name === 'ServiceOrder') {
                return record?.serviceOrder ?? null;
              }

              return null;
            }),
            save: jest.fn(),
          }),
        ),
    };

    const service = new ExecutionEngineService(
      dataSource as never,
      recordsRepository as never,
      serviceOrdersRepository as never,
      accessScope as never,
      [handler],
      snapshotBuilder as never,
      calculator as never,
      journalWriter as never,
      stockEngine as never,
      eventLogs as never,
      realtimeEvents as never,
    );

    return {
      service,
      mocks: {
        dataSource,
        recordsRepository,
        serviceOrdersRepository,
        accessScope,
        handler,
        snapshotBuilder,
        calculator,
        journalWriter,
        stockEngine,
        eventLogs,
        realtimeEvents,
      },
    };
  }

  function createDraftArtilleryRecord(): ExecutionRecord {
    return {
      id: 'record-1',
      serviceOrderId: 'order-1',
      idempotencyKey: 'idem-1',
      executionType: 'artillery',
      purpose: 'main',
      result: 'executed',
      startedAt: new Date('2026-07-11T10:00:00.000Z'),
      completedAt: null,
      executorType: 'fire_position',
      executorId: 'fp-1',
      executorSnapshot: {},
      quantity: 2,
      resourceSnapshot: {},
      comment: 'test',
      createdByUserId: 'user-1',
      createdAt: new Date('2026-07-11T10:00:00.000Z'),
      status: 'draft',
      stockOperationId: null,
      stockOperation: null,
      postedAt: null,
      postedByUserId: null,
      reversalOfRecordId: null,
      reversalOfRecord: null,
      serviceOrder: {
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'in_progress',
        executorType: 'fire_position',
        assignedUnitId: 'unit-1',
        selectedFirePosition: {
          ammoDepotId: 'depot-1',
          unitId: 'unit-1',
        },
        selectedAirAssetPosition: null,
      } as never,
      artillery: {
        executionRecordId: 'record-1',
        compositionSource: 'manual',
        sourceShotConfigurationId: null,
        weaponModelId: 'weapon-1',
        shellId: 'shell-1',
        fuzeId: 'fuze-1',
        primerId: 'primer-1',
        zoneId: 'zone-1',
        maxRangeM: 10000,
        compositionSnapshot: {},
        charges: [
          {
            chargeId: 'charge-1',
            chargeNameSnapshot: 'Charge 1',
            quantityPerShot: 2,
            accountingUnit: 'module',
            sortOrder: 0,
          },
        ],
      } as never,
    } as ExecutionRecord;
  }

  it('returns existing idempotent draft create without journal, stock, audit or realtime', async () => {
    const existing = createDraftArtilleryRecord();
    const { service, mocks } = createService({ record: existing });

    const result = await service.create(
      'order-1',
      {
        idempotencyKey: 'idem-1',
        executionType: 'artillery',
        purpose: 'main',
        result: 'executed',
        startedAt: '2026-07-11T10:00:00.000Z',
        quantity: 1,
        artillery: {
          compositionSource: 'manual',
          weaponModelId: 'weapon-1',
          shellId: 'shell-1',
          fuzeId: 'fuze-1',
          primerId: 'primer-1',
          zoneId: 'zone-1',
          maxRangeM: 10000,
          compositionSnapshot: {},
          charges: [
            {
              chargeId: 'charge-1',
              chargeName: 'Charge 1',
              quantityPerShot: 1,
              accountingUnit: 'piece',
              sortOrder: 0,
            },
          ],
        },
      },
      user,
    );

    expect(result).toBe(existing);
    expect(mocks.journalWriter.writeDraft).not.toHaveBeenCalled();
    expect(mocks.stockEngine.execute).not.toHaveBeenCalled();
    expect(mocks.eventLogs.create).not.toHaveBeenCalled();
    expect(mocks.realtimeEvents.emitMany).not.toHaveBeenCalled();
  });

  it('posts artillery record through stock engine once and marks record posted', async () => {
    const record = createDraftArtilleryRecord();
    const postedRecord = {
      ...record,
      status: 'posted',
      stockOperationId: 'stock-op-1',
      postedAt: new Date('2026-07-11T11:00:00.000Z'),
      postedByUserId: 'user-1',
    } as ExecutionRecord;

    const { service, mocks } = createService({ record });
    mocks.recordsRepository.findOne
      .mockResolvedValueOnce(record)
      .mockResolvedValueOnce(postedRecord);

    const result = await service.post(record.id, user);

    expect(mocks.stockEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `execution:${record.id}`,
        operationType: 'write_off',
        fromDepotId: 'depot-1',
        resources: [
          expect.objectContaining({
            resourceType: 'shell',
            resourceId: 'shell-1',
            quantity: 2,
          }),
          expect.objectContaining({
            resourceType: 'charge',
            resourceId: 'charge-1',
            quantity: 4,
          }),
        ],
      }),
      user,
    );
    expect(mocks.journalWriter.markPosted).toHaveBeenCalled();
    expect(mocks.eventLogs.create).toHaveBeenCalled();
    expect(mocks.realtimeEvents.emitMany).toHaveBeenCalled();
    expect(result.status).toBe('posted');
  });

  it('keeps draft when stock engine rejects insufficient stock', async () => {
    const record = createDraftArtilleryRecord();
    const stockExecute = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Недостатньо ресурсу'));
    const { service, mocks } = createService({ record, stockExecute });

    await expect(service.post(record.id, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(mocks.journalWriter.markPosted).not.toHaveBeenCalled();
    expect(mocks.eventLogs.create).not.toHaveBeenCalled();
    expect(mocks.realtimeEvents.emitMany).not.toHaveBeenCalled();
  });

  it('returns posted record on repeated post without second write-off', async () => {
    const postedRecord = {
      ...createDraftArtilleryRecord(),
      status: 'posted',
      stockOperationId: 'stock-op-1',
      postedAt: new Date('2026-07-11T11:00:00.000Z'),
      postedByUserId: 'user-1',
    } as ExecutionRecord;
    const { service, mocks } = createService({ record: postedRecord });

    const result = await service.post(postedRecord.id, user);

    expect(result).toBe(postedRecord);
    expect(mocks.stockEngine.execute).not.toHaveBeenCalled();
    expect(mocks.journalWriter.markPosted).not.toHaveBeenCalled();
  });

  it('rejects non-artillery posting without stock mutation', async () => {
    const record = {
      ...createDraftArtilleryRecord(),
      executionType: 'fpv',
      artillery: null,
    } as ExecutionRecord;
    const { service, mocks } = createService({ record });

    await expect(service.post(record.id, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(mocks.stockEngine.execute).not.toHaveBeenCalled();
    expect(mocks.journalWriter.markPosted).not.toHaveBeenCalled();
  });
});
