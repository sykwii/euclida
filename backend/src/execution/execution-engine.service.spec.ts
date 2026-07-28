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
    getRepository?: jest.Mock;
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
      executeInTransaction: options?.stockExecute
        ? jest.fn().mockImplementation(async (...args: unknown[]) => ({
            operation: await options.stockExecute!(...args),
            created: true,
          }))
        : jest.fn().mockResolvedValue({
            operation: { id: 'stock-op-1', movementGroupId: 'group-1' },
            created: true,
          }),
      publishCommittedOperation: jest.fn(),
    };
    const eventLogs = {
      create: jest.fn(),
    };
    const realtimeEvents = {
      emitMany: jest.fn(),
    };
    const dataSource = {
      ...(options?.getRepository ? { getRepository: options.getRepository } : {}),
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
        selectedFirePositionId: 'fp-1',
        selectedFirePosition: {
          id: 'fp-1',
          ammoDepotId: 'depot-1',
          unitId: 'unit-1',
          readinessStatus: 'combat_ready',
          notReadyReason: null,
          lat: 50,
          lng: 30,
        },
        targetLat: 50,
        targetLng: 30.01,
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
    expect(mocks.stockEngine.executeInTransaction).not.toHaveBeenCalled();
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

    expect(mocks.stockEngine.executeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `execution:${record.id}`,
        operationType: 'write_off',
        source: { type: 'depot', id: 'depot-1' },
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
      expect.anything(),
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
    expect(mocks.stockEngine.executeInTransaction).not.toHaveBeenCalled();
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

    expect(mocks.stockEngine.executeInTransaction).not.toHaveBeenCalled();
    expect(mocks.journalWriter.markPosted).not.toHaveBeenCalled();
  });

  it('returns structured rejection when selected weapon is not ready', async () => {
    const record = createDraftArtilleryRecord();
    const getRepository = jest.fn((entity: { name?: string }) => {
      if (entity.name === 'WeaponSystem') {
        return {
          findOne: jest.fn().mockResolvedValue({
            id: 'weapon-1',
            readinessStatus: 'not_combat_ready',
            notReadyReason: 'breakdown',
            deploymentStatus: 'at_fire_position',
            currentFirePositionId: 'fp-1',
          }),
        };
      }

      if (entity.name === 'WeaponMaintenance') {
        return { findOne: jest.fn().mockResolvedValue(null) };
      }

      if (entity.name === 'ShotConfiguration') {
        return { findOne: jest.fn().mockResolvedValue(null) };
      }

      return {
        findOne: jest.fn().mockResolvedValue({ quantity: 100 }),
        find: jest.fn().mockResolvedValue([
          {
            depotId: 'depot-1',
            shellId: 'shell-1',
            chargeId: 'charge-1',
            fuzeId: 'fuze-1',
            primerId: 'primer-1',
            quantity: 100,
          },
        ]),
      };
    });
    const { service } = createService({ record, getRepository });

    const result = await service.validateRecord(record.id, user);

    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'weapon_not_ready' }),
      ]),
    );
  });

  it('returns exact structured stock shortage and consumption preview', async () => {
    const record = createDraftArtilleryRecord();
    const getRepository = jest.fn((entity: { name?: string }) => {
      if (entity.name === 'WeaponSystem') {
        return {
          findOne: jest.fn().mockResolvedValue({
            id: 'weapon-1',
            weaponModelId: 'weapon-1',
            readinessStatus: 'combat_ready',
            notReadyReason: null,
            deploymentStatus: 'at_fire_position',
            currentFirePositionId: 'fp-1',
          }),
        };
      }
      if (entity.name === 'WeaponMaintenance') {
        return { findOne: jest.fn().mockResolvedValue(null) };
      }
      return {
        find: jest.fn().mockResolvedValue(
          entity.name === 'DepotShellStock'
            ? [{ depotId: 'depot-1', shellId: 'shell-1', quantity: 1 }]
            : entity.name === 'DepotChargeStock'
              ? [{ depotId: 'depot-1', chargeId: 'charge-1', quantity: 100 }]
              : [],
        ),
      };
    });
    const { service } = createService({ record, getRepository });

    const result = await service.validateRecord(record.id, user);

    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'shell_shortage',
          resourceType: 'shell',
          resourceId: 'shell-1',
          required: 2,
          available: 1,
        }),
      ]),
    );
    expect(result.consumptionPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          resourceType: 'charge',
          required: 4,
          accountingUnit: 'module',
        }),
      ]),
    );
  });
});
