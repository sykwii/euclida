import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { EventLogsService } from '../event-logs/event-logs.service';
import { ExecutionRecord } from '../execution/execution-record.entity';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { AuthUser } from '../auth/auth-user.types';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';
import { CompleteServiceOrderDto } from './dto/complete-service-order.dto';
import { ServiceOrderDelivery } from './service-order-delivery.entity';
import { ServiceOrder } from './service-order.entity';
import { ServiceOrdersService } from './service-orders.service';

type ServiceOrderRepositoryMock = Pick<Repository<ServiceOrder>, 'findOne' | 'save'>;
type ExecutionRecordRepositoryMock = Pick<Repository<ExecutionRecord>, 'find'>;
type TransactionManagerMock = {
  findOne: jest.Mock<Promise<unknown>, [unknown, unknown]>;
  save: jest.Mock<Promise<unknown>, [unknown, unknown]>;
  createQueryBuilder: jest.Mock;
};
type DataSourceMock = Pick<DataSource, 'transaction' | 'getRepository'>;
type PrivateServiceOrdersApi = {
  completeLegacy: (
    id: string,
    body: CompleteServiceOrderDto,
    user: AuthUser,
  ) => Promise<ServiceOrder>;
  writeOrderEvent: (
    order: ServiceOrder,
    user: AuthUser,
    action: string,
    title: string,
  ) => Promise<void>;
  notifyRealtime: (
    orderOrId?: ServiceOrder | string,
    action?:
      | 'created'
      | 'updated'
      | 'deleted'
      | 'sent'
      | 'accepted'
      | 'rejected'
      | 'started'
      | 'completed'
      | 'changed',
    scopes?: Array<'missions' | 'map' | 'stock' | 'analytics' | 'events'>,
  ) => void;
  ensureCanExecuteOrder: (order: ServiceOrder, user: AuthUser) => Promise<void>;
  createDeliveriesForOrder: (
    manager: TransactionManagerMock,
    order: ServiceOrder,
  ) => Promise<void>;
};

describe('ServiceOrdersService SE-5 completion flow', () => {
  let service: ServiceOrdersService;
  let repository: jest.Mocked<ServiceOrderRepositoryMock>;
  let executionRecordsRepository: jest.Mocked<ExecutionRecordRepositoryMock>;
  let manager: TransactionManagerMock;
  let dataSource: DataSourceMock;
  let accessScope: Pick<AccessScopeService, 'canAccessUnit'>;

  const user: AuthUser = {
    sub: 'user-1',
    login: 'operator',
    role: 'operator',
    scope: 'battery',
    fullName: 'Operator',
    unitId: 'unit-1',
  };

  const body: CompleteServiceOrderDto = {
    startedAt: '2026-07-11T10:00:00.000Z',
    completedAt: '2026-07-11T10:10:00.000Z',
    actualQuantity: 1,
    resultType: 'done',
    resultComment: 'ok',
  };

  beforeEach(() => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    executionRecordsRepository = {
      find: jest.fn(),
    };

    manager = {
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(async (callback: (tx: TransactionManagerMock) => Promise<ServiceOrder>) =>
        callback(manager),
      ),
      getRepository: jest.fn(
        () =>
          ({
            exists: jest.fn(async () => false),
          }) as unknown as Repository<unknown>,
      ),
    };

    accessScope = {
      canAccessUnit: jest.fn(async () => true),
    };

    service = new ServiceOrdersService(
      repository as unknown as Repository<ServiceOrder>,
      executionRecordsRepository as unknown as Repository<ExecutionRecord>,
      {} as ServiceOrderSuggestionsService,
      { emitMany: jest.fn() } as unknown as RealtimeEventsService,
      accessScope as AccessScopeService,
      { create: jest.fn(async () => undefined) } as unknown as EventLogsService,
      dataSource as DataSource,
    );

    manager.createQueryBuilder.mockReturnValue({
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => undefined),
    });

    jest
      .spyOn(service as unknown as PrivateServiceOrdersApi, 'ensureCanExecuteOrder')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as unknown as PrivateServiceOrdersApi, 'writeOrderEvent')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as unknown as PrivateServiceOrdersApi, 'notifyRealtime')
      .mockImplementation(() => undefined);
  });

  function createOrder(overrides: Partial<ServiceOrder> = {}): ServiceOrder {
    return {
      id: 'order-1',
      orderNumber: 'VGZ-001',
      status: 'in_progress',
      targetLat: 0,
      targetLng: 0,
      targetMgrs: null,
      targetSettlement: null,
      taskType: 'fire',
      plannedResourceAId: null,
      plannedResourceBId: null,
      plannedQuantity: 3,
      actualQuantity: null,
      actualChargeQuantity: null,
      actualChargeModulesPerShot: null,
      selectedFirePositionId: 'fp-1',
      executorType: 'fire_position',
      selectedAirAssetPositionId: null,
      selectedAirAssetPosition: null,
      selectedDroneModelId: null,
      selectedDroneModel: null,
      selectedWarheadTypeId: null,
      selectedWarheadType: null,
      linkedAirTaskId: null,
      selectedShellId: null,
      selectedChargeId: null,
      selectedZoneId: null,
      selectedShotConfigurationId: null,
      selectedFirePosition: null,
      selectedShell: null,
      selectedCharge: null,
      selectedZone: null,
      selectedShotConfiguration: null,
      rejectionReason: null,
      rejectedByUnitName: null,
      rejectedAt: null,
      startedAt: null,
      completedAt: null,
      resultType: null,
      resultComment: null,
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      updatedAt: new Date('2026-07-11T09:05:00.000Z'),
      createdByUserId: 'creator-1',
      assignedUnitId: 'unit-1',
      assignedScope: 'battery',
      sentByUserId: null,
      acceptedByUserId: null,
      completedByUserId: null,
      reconSnapshot: null,
      actualShotConfigurationSnapshot: null,
      sourceReconTargetId: null,
      sourceReconObservationId: null,
      sourcePuarProposalId: null,
      ...overrides,
    } as ServiceOrder;
  }

  function createFirePosition(overrides: Partial<FirePosition> = {}): FirePosition {
    return {
      id: 'fp-1',
      name: 'FP',
      positionType: 'fire_position',
      unitId: 'unit-1',
      unit: null,
      lat: 0,
      lng: 0,
      mgrs: null,
      mainDirection: null,
      traverseLimits: null,
      hasSg: false,
      readinessStatus: 'in_progress',
      notReadyReason: null,
      completedVgzCount: 2,
      personnelRotationStatus: null,
      airSituationStatus: null,
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      updatedAt: new Date('2026-07-11T09:00:00.000Z'),
      ammoDepotId: 'depot-1',
      mainDirectionUnits: null,
      mainDirectionDegrees: null,
      traverseLeftDegrees: null,
      traverseRightDegrees: null,
      traverseLeftUnits: null,
      traverseRightUnits: null,
      sectorLeftDegrees: null,
      sectorRightDegrees: null,
      personnelRotationDate: null,
      ammoDepot: null,
      ...overrides,
    };
  }

  function createExecutionRecord(
    overrides: Partial<ExecutionRecord> = {},
  ): ExecutionRecord {
    return {
      id: 'record-1',
      serviceOrderId: 'order-1',
      idempotencyKey: 'execution:record-1',
      executionType: 'artillery',
      purpose: null,
      result: null,
      startedAt: new Date('2026-07-11T10:00:00.000Z'),
      completedAt: new Date('2026-07-11T10:05:00.000Z'),
      executorType: 'fire_position',
      executorId: 'fp-1',
      executorSnapshot: null,
      quantity: 1,
      resourceSnapshot: null,
      comment: null,
      createdByUserId: 'user-1',
      createdAt: new Date('2026-07-11T10:00:00.000Z'),
      status: 'posted',
      stockOperationId: 'stock-op-1',
      postedAt: new Date('2026-07-11T10:05:00.000Z'),
      postedByUserId: 'user-1',
      reversalOfRecordId: null,
      reversalOfRecord: null,
      artillery: null,
      ...overrides,
    } as ExecutionRecord;
  }

  it('creates division and battery deliveries with idempotent insert', async () => {
    const order = createOrder({
      selectedFirePositionId: 'fp-1',
      selectedFirePosition: createFirePosition({ unitId: 'unit-1' }),
    });
    const batteryUnit = {
      id: 'unit-1',
      name: 'Battery',
      type: 'battery',
      parentId: 'division-1',
      parent: null,
      sortOrder: 0,
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      updatedAt: new Date('2026-07-11T09:00:00.000Z'),
    };
    const divisionUnit = {
      ...batteryUnit,
      id: 'division-1',
      name: 'Division',
      type: 'division',
      parentId: null,
    };
    const queryBuilder = manager.createQueryBuilder();

    manager.findOne
      .mockResolvedValueOnce(batteryUnit)
      .mockResolvedValueOnce(divisionUnit);

    await (service as unknown as PrivateServiceOrdersApi).createDeliveriesForOrder(
      manager,
      order,
    );

    expect(queryBuilder.orIgnore).toHaveBeenCalledTimes(1);
    expect(queryBuilder.values).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          serviceOrderId: 'order-1',
          recipientUnitId: 'division-1',
          recipientLevel: 'division',
        }),
        expect.objectContaining({
          serviceOrderId: 'order-1',
          recipientUnitId: 'unit-1',
          recipientLevel: 'battery',
        }),
      ]),
    );
  });

  it('rejects completion when journal exists but has no posted records', async () => {
    const order = createOrder();
    repository.findOne.mockResolvedValue(order);
    executionRecordsRepository.find.mockResolvedValue([
      createExecutionRecord({ status: 'draft', quantity: 2 }),
    ]);

    await expect(service.complete(order.id, body, user)).rejects.toThrow(
      'Неможливо завершити ВГЗ без хоча б одного проведеного запису журналу виконання',
    );
  });

  it('rejects completion when a draft consumable journal record exists', async () => {
    const order = createOrder();
    repository.findOne.mockResolvedValue(order);
    executionRecordsRepository.find.mockResolvedValue([
      createExecutionRecord({ id: 'posted', status: 'posted', quantity: 2 }),
      createExecutionRecord({ id: 'draft', status: 'draft', quantity: 1 }),
    ]);

    await expect(service.complete(order.id, body, user)).rejects.toThrow(
      'Є непроведене виконання',
    );
  });

  it('returns an already sent order without creating duplicate deliveries', async () => {
    const order = createOrder({ status: 'sent' });
    repository.findOne.mockResolvedValue(order);
    const mainUser: AuthUser = { ...user, role: 'admin', scope: 'main', unitId: null };

    const result = await service.sendToUnit(order.id, {}, mainUser);

    expect(result).toBe(order);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects a repeated accept with a localized state conflict', async () => {
    const order = createOrder({ status: 'accepted' });
    repository.findOne.mockResolvedValue(order);

    await expect(service.accept(order.id, user)).rejects.toThrow(
      'ВГЗ вже прийнято іншим оператором',
    );
  });

  it('uses only posted records and ignores reversed records', async () => {
    const order = createOrder();
    const lockedOrder = createOrder();
    const firePosition = createFirePosition();

    repository.findOne.mockResolvedValue(order);
    executionRecordsRepository.find.mockResolvedValue([
      createExecutionRecord({ id: 'posted-1', status: 'posted', quantity: 3 }),
      createExecutionRecord({ id: 'reversed-1', status: 'reversed', quantity: 7 }),
      createExecutionRecord({ id: 'posted-2', status: 'posted', quantity: 2 }),
    ]);

    manager.findOne
      .mockResolvedValueOnce(lockedOrder)
      .mockResolvedValueOnce(firePosition);
    manager.save
      .mockImplementationOnce(async (_entity, value) => value as ServiceOrder)
      .mockImplementationOnce(async (_entity, value) => value as FirePosition);

    const saved = await service.complete(order.id, body, user);

    expect(saved.status).toBe('completed');
    expect(saved.actualQuantity).toBe(5);
    expect(manager.save).toHaveBeenCalledTimes(2);
    const savedFirePosition = manager.save.mock.calls[1]?.[1] as FirePosition;
    expect(savedFirePosition.completedVgzCount).toBe(3);
    expect(savedFirePosition.readinessStatus).toBe('in_progress');
  });

  it('supports idempotent repeated completion for already completed order', async () => {
    const completedAt = new Date();
    const order = createOrder({
      status: 'completed',
      completedAt,
      actualQuantity: 4,
    });
    const lockedOrder = createOrder({
      status: 'completed',
      completedAt,
      actualQuantity: 4,
    });
    const firePosition = createFirePosition({
      readinessStatus: 'ready',
      completedVgzCount: 5,
    });

    repository.findOne.mockResolvedValue(order);
    executionRecordsRepository.find.mockResolvedValue([
      createExecutionRecord({ id: 'posted-1', status: 'posted', quantity: 4 }),
      createExecutionRecord({ id: 'reversed-1', status: 'reversed', quantity: 2 }),
    ]);

    manager.findOne
      .mockResolvedValueOnce(lockedOrder)
      .mockResolvedValueOnce(firePosition);
    manager.save.mockImplementationOnce(async (_entity, value) => value as ServiceOrder);

    const saved = await service.complete(order.id, body, user);

    expect(saved.status).toBe('completed');
    expect(saved.actualQuantity).toBe(4);
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('rejects completion when no execution journal exists', async () => {
    const order = createOrder();

    repository.findOne.mockResolvedValue(order);
    executionRecordsRepository.find.mockResolvedValue([]);

    await expect(service.complete(order.id, body, user)).rejects.toThrow(
      'Завершення доступне тільки після створення, перевірки та проведення запису журналу виконання.',
    );
  });

  it('marks delivery viewed exactly once', async () => {
    const delivery = createDelivery({ status: 'new', viewedAt: null });
    const viewedAt = new Date('2026-07-11T10:00:00.000Z');

    manager.findOne
      .mockResolvedValueOnce(delivery)
      .mockResolvedValueOnce(delivery);
    manager.save.mockResolvedValueOnce({
      ...delivery,
      status: 'viewed',
      viewedAt,
    } as ServiceOrderDelivery);
    (dataSource.getRepository as jest.Mock).mockReturnValueOnce({
      findOne: jest.fn(async () => ({
        ...delivery,
        status: 'viewed',
        viewedAt,
      })),
    });

    const result = await service.markDeliveryViewed('delivery-1', user);

    expect(result.status).toBe('viewed');
    expect(manager.save).toHaveBeenCalledTimes(1);
  });

  it('requires rejection reason for delivery rejection', async () => {
    const delivery = createDelivery({ status: 'viewed' });
    manager.findOne
      .mockResolvedValueOnce(delivery)
      .mockResolvedValueOnce(delivery);

    await expect(
      service.respondDelivery('delivery-1', { status: 'rejected' }, user),
    ).rejects.toThrow('Для відхилення потрібно вказати причину');
  });

  it('accepts battery delivery independently and keeps one order source', async () => {
    const delivery = createDelivery({ status: 'viewed' });
    const order = createOrder({ status: 'sent' });

    manager.findOne
      .mockResolvedValueOnce(delivery)
      .mockResolvedValueOnce(delivery)
      .mockResolvedValueOnce(order);
    manager.save
      .mockImplementationOnce(async (_entity, value) => value as ServiceOrderDelivery)
      .mockImplementationOnce(async (_entity, value) => value as ServiceOrder);
    (dataSource.getRepository as jest.Mock).mockReturnValueOnce({
      findOne: jest.fn(async () => ({
        ...delivery,
        status: 'accepted',
        respondedByUserId: user.sub,
      })),
    });

    const result = await service.respondDelivery(
      'delivery-1',
      { status: 'accepted', comment: 'ready' },
      user,
    );

    expect(result.status).toBe('accepted');
    expect(order.status).toBe('accepted');
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  function createDelivery(
    overrides: Partial<ServiceOrderDelivery> = {},
  ): ServiceOrderDelivery {
    return {
      id: 'delivery-1',
      serviceOrderId: 'order-1',
      serviceOrder: createOrder({ status: 'sent' }),
      recipientUnitId: 'unit-1',
      recipientUnit: {
        id: 'unit-1',
        name: 'Battery',
        type: 'battery',
        parentId: 'division-1',
        parent: null,
        sortOrder: 0,
        createdAt: new Date('2026-07-11T09:00:00.000Z'),
        updatedAt: new Date('2026-07-11T09:00:00.000Z'),
      },
      recipientLevel: 'battery',
      status: 'new',
      deliveredAt: new Date('2026-07-11T09:00:00.000Z'),
      viewedAt: null,
      respondedAt: null,
      respondedByUserId: null,
      rejectionReason: null,
      comment: null,
      estimatedReadyAt: null,
      selectedFirePositionId: null,
      selectedFirePosition: null,
      selectedWeaponSystemId: null,
      selectedWeaponSystem: null,
      createdAt: new Date('2026-07-11T09:00:00.000Z'),
      updatedAt: new Date('2026-07-11T09:00:00.000Z'),
      ...overrides,
    } as ServiceOrderDelivery;
  }
});
