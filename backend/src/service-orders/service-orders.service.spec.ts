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
import { ServiceOrder } from './service-order.entity';
import { ServiceOrdersService } from './service-orders.service';

type ServiceOrderRepositoryMock = Pick<Repository<ServiceOrder>, 'findOne' | 'save'>;
type ExecutionRecordRepositoryMock = Pick<Repository<ExecutionRecord>, 'find'>;
type TransactionManagerMock = {
  findOne: jest.Mock<Promise<ServiceOrder | FirePosition | null>, [unknown, unknown]>;
  save: jest.Mock<Promise<ServiceOrder | FirePosition>, [unknown, ServiceOrder | FirePosition]>;
};
type DataSourceMock = Pick<DataSource, 'transaction'>;
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
    };

    dataSource = {
      transaction: jest.fn(async (callback: (tx: TransactionManagerMock) => Promise<ServiceOrder>) =>
        callback(manager),
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
      {} as EventLogsService,
      dataSource as DataSource,
    );

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
      'Неможливо завершити ВГЗ, поки існують непроведені витратні записи журналу виконання',
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

  it('falls back to legacy completion when no execution journal exists', async () => {
    const order = createOrder();
    const expected = createOrder({ status: 'completed' });

    repository.findOne.mockResolvedValue(order);
    executionRecordsRepository.find.mockResolvedValue([]);

    const completeLegacySpy = jest
      .spyOn(service as unknown as PrivateServiceOrdersApi, 'completeLegacy')
      .mockResolvedValue(expected);

    const saved = await service.complete(order.id, body, user);

    expect(completeLegacySpy).toHaveBeenCalledWith(order.id, body, user);
    expect(saved).toBe(expected);
  });
});
