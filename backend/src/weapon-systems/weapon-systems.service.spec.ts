import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { EventLogsService } from '../event-logs/event-logs.service';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { WeaponDeployment } from './weapon-deployment.entity';
import { WeaponMaintenance } from './weapon-maintenance.entity';
import { WeaponSystem } from './weapon-system.entity';
import { WeaponSystemsService } from './weapon-systems.service';

type RepoMock<T> = Pick<
  Repository<T>,
  'findOne' | 'find' | 'save' | 'update' | 'remove'
>;
type ManagerMock = {
  getRepository: jest.Mock<RepoMock<unknown>, [unknown]>;
  create: jest.Mock<unknown, [unknown, unknown]>;
  save: jest.Mock<Promise<unknown>, [unknown, unknown]>;
};
type DataSourceMock = Pick<
  DataSource,
  'transaction' | 'query' | 'getRepository'
>;

describe('WeaponSystemsService OPS-1 readiness and deployment', () => {
  let weaponRepository: jest.Mocked<RepoMock<WeaponSystem>>;
  let maintenanceRepository: jest.Mocked<RepoMock<WeaponMaintenance>>;
  let deploymentRepository: jest.Mocked<RepoMock<WeaponDeployment>>;
  let firePositionRepository: jest.Mocked<RepoMock<FirePosition>>;
  let serviceOrderRepository: jest.Mocked<RepoMock<ServiceOrder>>;
  let manager: ManagerMock;
  let dataSource: DataSourceMock;
  let service: WeaponSystemsService;

  const user: AuthUser = {
    sub: 'user-1',
    login: 'operator',
    role: 'operator',
    scope: 'battery',
    fullName: 'Operator',
    unitId: 'unit-1',
  };

  beforeEach(() => {
    weaponRepository = createRepoMock<WeaponSystem>();
    maintenanceRepository = createRepoMock<WeaponMaintenance>();
    deploymentRepository = createRepoMock<WeaponDeployment>();
    firePositionRepository = createRepoMock<FirePosition>();
    serviceOrderRepository = createRepoMock<ServiceOrder>();

    manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WeaponSystem)
          return weaponRepository as RepoMock<unknown>;
        if (entity === WeaponMaintenance)
          return maintenanceRepository as RepoMock<unknown>;
        if (entity === WeaponDeployment)
          return deploymentRepository as RepoMock<unknown>;
        if (entity === FirePosition)
          return firePositionRepository as RepoMock<unknown>;
        if (entity === ServiceOrder)
          return serviceOrderRepository as RepoMock<unknown>;
        throw new Error('Unexpected repository');
      }),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
    };

    dataSource = {
      transaction: jest.fn(
        async (callback: (tx: ManagerMock) => Promise<unknown>) =>
          callback(manager),
      ),
      query: jest.fn(),
      getRepository: jest.fn((entity: unknown) =>
        manager.getRepository(entity),
      ),
    };

    service = new WeaponSystemsService(
      weaponRepository as Repository<WeaponSystem>,
      {
        canAccessUnit: jest.fn(async () => true),
        getAllowedUnitIds: jest.fn(),
      } as unknown as AccessScopeService,
      {
        emitMany: jest.fn(),
        emit: jest.fn(),
      } as unknown as RealtimeEventsService,
      { create: jest.fn(async () => undefined) } as unknown as EventLogsService,
      dataSource as DataSource,
    );
  });

  it('rejects assigning a not combat ready weapon even when force is requested', async () => {
    const weapon = createWeapon({ readinessStatus: 'not_combat_ready' });
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon);
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());

    await expect(
      service.assignToFirePosition(
        'weapon-1',
        { targetFirePositionId: 'fp-1', force: true },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assigns weapon from reserve to fire position', async () => {
    const weapon = createWeapon({ readinessStatus: 'combat_ready' });
    const assignedWeapon = createWeapon({
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      firePositionId: 'fp-1',
      locationType: 'fire_position',
    });

    weaponRepository.findOne.mockResolvedValue(assignedWeapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(null);
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());
    deploymentRepository.findOne.mockResolvedValueOnce(null);

    const result = await service.assignToFirePosition(
      'weapon-1',
      { targetFirePositionId: 'fp-1', force: true },
      user,
    );

    expect(result.deploymentStatus).toBe('at_fire_position');
    expect(result.currentFirePositionId).toBe('fp-1');
    expect(manager.save).toHaveBeenCalledWith(
      WeaponSystem,
      expect.objectContaining({
        deploymentStatus: 'at_fire_position',
        currentFirePositionId: 'fp-1',
      }),
    );
  });

  it('derives a missing fire position unit from the assigned weapon', async () => {
    const weapon = createWeapon({
      readinessStatus: 'combat_ready',
      unitId: 'unit-1',
    });
    const firePosition = createFirePosition({ unitId: null });

    weaponRepository.findOne.mockResolvedValue(weapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    firePositionRepository.findOne.mockResolvedValueOnce(firePosition);
    deploymentRepository.findOne.mockResolvedValueOnce(null);

    await service.planMoveToFirePosition(
      'weapon-1',
      { targetFirePositionId: 'fp-1', force: true },
      user,
    );

    expect(firePosition.unitId).toBe('unit-1');
    expect(manager.save).toHaveBeenCalledWith(
      FirePosition,
      expect.objectContaining({ id: 'fp-1', unitId: 'unit-1' }),
    );
    expect(manager.save).toHaveBeenCalledWith(
      WeaponDeployment,
      expect.objectContaining({ status: 'planned', toLocationId: 'fp-1' }),
    );
  });

  it('rejects assignment to a fire position with a different unit', async () => {
    const weapon = createWeapon({
      readinessStatus: 'combat_ready',
      unitId: 'unit-1',
    });
    const firePosition = createFirePosition({ unitId: 'unit-2' });

    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon);
    firePositionRepository.findOne.mockResolvedValueOnce(firePosition);

    await expect(
      service.planMoveToFirePosition(
        'weapon-1',
        { targetFirePositionId: 'fp-1', force: true },
        user,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('locks nullable current fire position weapons without relation joins', async () => {
    const weapon = createWeapon({
      currentFirePositionId: null,
      currentFirePosition: null,
      firePositionId: null,
      firePosition: null,
    });
    const assignedWeapon = createWeapon({
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      firePositionId: 'fp-1',
      locationType: 'fire_position',
    });

    weaponRepository.findOne.mockResolvedValue(assignedWeapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(null);
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());
    deploymentRepository.findOne.mockResolvedValueOnce(null);

    await service.assignToFirePosition(
      'weapon-1',
      { targetFirePositionId: 'fp-1', force: true },
      user,
    );

    expect(weaponRepository.findOne.mock.calls[0]?.[0]).toEqual({
      where: { id: 'weapon-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(weaponRepository.findOne.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'weapon-1' },
      relations: expect.any(Object),
    });
  });

  it('plans, starts and confirms movement to a fire position', async () => {
    const reserveWeapon = createWeapon({ readinessStatus: 'combat_ready' });
    const movingWeapon = createWeapon({
      deploymentStatus: 'moving_to_fire_position',
      currentFirePositionId: null,
    });
    const arrivedWeapon = createWeapon({
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      firePositionId: 'fp-1',
      locationType: 'fire_position',
    });

    weaponRepository.findOne.mockResolvedValue(reserveWeapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(reserveWeapon)
      .mockResolvedValueOnce(reserveWeapon)
      .mockResolvedValueOnce(null);
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());
    deploymentRepository.findOne.mockResolvedValueOnce(null);

    await service.planMoveToFirePosition(
      'weapon-1',
      { targetFirePositionId: 'fp-1', force: true },
      user,
    );

    expect(manager.save).toHaveBeenCalledWith(
      WeaponDeployment,
      expect.objectContaining({ status: 'planned', toLocationId: 'fp-1' }),
    );

    weaponRepository.findOne.mockReset();
    firePositionRepository.findOne.mockReset();
    deploymentRepository.findOne.mockReset();
    manager.save.mockClear();

    weaponRepository.findOne.mockResolvedValue(movingWeapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(reserveWeapon)
      .mockResolvedValueOnce(reserveWeapon)
      .mockResolvedValueOnce(null);
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());
    deploymentRepository.findOne.mockResolvedValueOnce(
      createDeployment({
        status: 'planned',
        toLocationType: 'fire_position',
        toLocationId: 'fp-1',
      }),
    );

    await service.startMoveToFirePosition('weapon-1', {}, user);

    expect(manager.save).toHaveBeenCalledWith(
      WeaponSystem,
      expect.objectContaining({ deploymentStatus: 'moving_to_fire_position' }),
    );

    weaponRepository.findOne.mockReset();
    firePositionRepository.findOne.mockReset();
    deploymentRepository.findOne.mockReset();
    manager.save.mockClear();

    weaponRepository.findOne.mockResolvedValue(arrivedWeapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(movingWeapon)
      .mockResolvedValueOnce(movingWeapon)
      .mockResolvedValueOnce(null);
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());
    deploymentRepository.findOne.mockResolvedValueOnce(
      createDeployment({
        status: 'moving',
        toLocationType: 'fire_position',
        toLocationId: 'fp-1',
      }),
    );

    const result = await service.confirmFirePositionArrival(
      'weapon-1',
      { targetFirePositionId: 'fp-1' },
      user,
    );

    expect(result.deploymentStatus).toBe('at_fire_position');
    expect(manager.save).toHaveBeenCalledWith(
      WeaponSystem,
      expect.objectContaining({
        deploymentStatus: 'at_fire_position',
        currentFirePositionId: 'fp-1',
      }),
    );
  });

  it('rejects duplicate fire position occupancy', async () => {
    const weapon = createWeapon({ readinessStatus: 'combat_ready' });
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(createWeapon({ id: 'weapon-2' }));
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());

    await expect(
      service.assignToFirePosition(
        'weapon-1',
        { targetFirePositionId: 'fp-1', force: true },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 404 when assigning a missing weapon', async () => {
    weaponRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.assignToFirePosition(
        'missing-weapon',
        { targetFirePositionId: 'fp-1', force: true },
        user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('opens maintenance and marks weapon not combat ready', async () => {
    const weapon = createWeapon();

    weaponRepository.findOne.mockResolvedValue(weapon);
    maintenanceRepository.findOne.mockResolvedValueOnce(null);

    await service.openMaintenance(
      'weapon-1',
      { reason: 'breakdown', durationMinutes: 60, description: 'repair' },
      user,
    );

    expect(weapon.readinessStatus).toBe('not_combat_ready');
    expect(weapon.notReadyReason).toBe('breakdown');
    expect(weapon.maintenanceStatus).toBe('opened');
    expect(manager.save).toHaveBeenCalledWith(
      WeaponMaintenance,
      expect.objectContaining({ status: 'opened', reason: 'breakdown' }),
    );
  });

  it('opens maintenance with explicit expected completion date', async () => {
    const weapon = createWeapon();
    const expectedCompletedAt = '2026-07-15T08:30:00.000Z';

    weaponRepository.findOne.mockResolvedValue(weapon);
    maintenanceRepository.findOne.mockResolvedValueOnce(null);

    await service.openMaintenance(
      'weapon-1',
      { reason: 'scheduled', expectedCompletedAt },
      user,
    );

    expect(weapon.maintenancePlannedEndAt?.toISOString()).toBe(
      expectedCompletedAt,
    );
    expect(manager.save).toHaveBeenCalledWith(
      WeaponMaintenance,
      expect.objectContaining({
        status: 'opened',
        reason: 'scheduled',
        expectedCompletedAt: new Date(expectedCompletedAt),
      }),
    );
  });

  it('starts maintenance', async () => {
    const weapon = createWeapon({ maintenanceStatus: 'opened' });
    const maintenance = createMaintenance({ status: 'opened' });

    weaponRepository.findOne.mockResolvedValue(weapon);
    maintenanceRepository.findOne.mockResolvedValueOnce(maintenance);

    await service.startMaintenance('weapon-1', user);

    expect(maintenance.status).toBe('in_progress');
    expect(weapon.maintenanceStatus).toBe('in_progress');
  });

  it('cancels active maintenance', async () => {
    const weapon = createWeapon({ maintenanceStatus: 'opened' });
    const maintenance = createMaintenance({ status: 'opened' });

    weaponRepository.findOne.mockResolvedValue(weapon);
    maintenanceRepository.findOne.mockResolvedValueOnce(maintenance);

    await service.cancelMaintenance('weapon-1', user);

    expect(maintenance.status).toBe('cancelled');
    expect(weapon.maintenanceStatus).toBe('cancelled');
  });

  it('rejects duplicate active maintenance', async () => {
    const weapon = createWeapon({ maintenanceStatus: 'opened' });

    weaponRepository.findOne.mockResolvedValue(weapon);
    maintenanceRepository.findOne.mockResolvedValueOnce(
      createMaintenance({ status: 'opened' }),
    );

    await expect(
      service.openMaintenance('weapon-1', { reason: 'scheduled' }, user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks deployment while maintenance is active', async () => {
    const weapon = createWeapon({
      maintenanceStatus: 'opened',
      maintenances: [createMaintenance({ status: 'opened' })],
    });

    weaponRepository.findOne.mockResolvedValue(weapon);

    await expect(
      service.planMoveToFirePosition(
        'weapon-1',
        { targetFirePositionId: 'fp-1', force: true },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks withdrawal while a fire position has active execution', async () => {
    const weapon = createWeapon({
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      firePositionId: 'fp-1',
      locationType: 'fire_position',
    });
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon);
    serviceOrderRepository.findOne.mockResolvedValueOnce({
      id: 'order-1',
    } as ServiceOrder);

    await expect(
      service.moveToReserve('weapon-1', user),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps reserve arrival transition behavior', async () => {
    const weapon = createWeapon({
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      firePositionId: 'fp-1',
      locationType: 'fire_position',
    });
    const reservedWeapon = createWeapon();

    weaponRepository.findOne.mockResolvedValue(reservedWeapon);
    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(weapon);
    serviceOrderRepository.findOne.mockResolvedValueOnce(null);
    deploymentRepository.findOne.mockResolvedValueOnce(null);

    const result = await service.moveToReserve('weapon-1', user);

    expect(result.deploymentStatus).toBe('reserve_area');
    expect(manager.save).toHaveBeenCalledWith(
      WeaponSystem,
      expect.objectContaining({
        deploymentStatus: 'reserve_area',
        currentFirePositionId: null,
      }),
    );
  });

  it('does not auto-confirm readiness when maintenance is completed', async () => {
    const weapon = createWeapon({
      readinessStatus: 'not_combat_ready',
      notReadyReason: 'breakdown',
      maintenanceStatus: 'approved',
    });
    const maintenance = createMaintenance({ status: 'in_progress' });
    weaponRepository.findOne.mockResolvedValue(weapon);
    maintenanceRepository.findOne.mockResolvedValueOnce(maintenance);

    await service.completeMaintenance('weapon-1', { result: 'done' }, user);

    expect(weapon.readinessStatus).toBe('not_combat_ready');
    expect(weapon.notReadyReason).toBe('breakdown');
    expect(maintenance.status).toBe('completed');
  });

  it('explicitly confirms readiness after completed maintenance', async () => {
    const weapon = createWeapon({
      readinessStatus: 'not_combat_ready',
      notReadyReason: 'maintenance',
      maintenanceStatus: 'completed',
    });
    const savedWeapon = createWeapon({
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      maintenanceStatus: 'completed',
    });

    weaponRepository.findOne
      .mockResolvedValueOnce(weapon)
      .mockResolvedValueOnce(savedWeapon);
    weaponRepository.save.mockResolvedValueOnce(savedWeapon);

    const result = await service.confirmReadiness(
      'weapon-1',
      { readinessStatus: 'combat_ready' },
      user,
    );

    expect(result.readinessStatus).toBe('combat_ready');
    expect(result.notReadyReason).toBeNull();
  });

  function createRepoMock<T>(): jest.Mocked<RepoMock<T>> {
    return {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(async (value: T) => value),
      update: jest.fn(),
      remove: jest.fn(),
    };
  }

  function createWeapon(overrides: Partial<WeaponSystem> = {}): WeaponSystem {
    return {
      id: 'weapon-1',
      weaponModelId: 'model-1',
      weaponModel: null,
      serialNumber: 'SN-1',
      callsign: 'Alpha',
      unitId: 'unit-1',
      unit: null,
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      deploymentStatus: 'reserve_area',
      currentFirePositionId: null,
      currentFirePosition: null,
      maintenanceStatus: null,
      maintenanceRequestedStartAt: null,
      maintenancePlannedEndAt: null,
      maintenanceActualEndAt: null,
      maintenanceNote: null,
      maintenanceRequestedByUserId: null,
      maintenanceApprovedByUserId: null,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      locationType: 'reserve',
      firePositionId: null,
      firePosition: null,
      maintenances: [],
      deployments: [],
      ...overrides,
    } as WeaponSystem;
  }

  function createFirePosition(
    overrides: Partial<FirePosition> = {},
  ): FirePosition {
    return {
      id: 'fp-1',
      name: 'FP-1',
      positionType: 'fire_position',
      unitId: 'unit-1',
      unit: null,
      lat: 0,
      lng: 0,
      mgrs: null,
      mainDirection: null,
      traverseLimits: null,
      hasSg: false,
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      completedVgzCount: 0,
      personnelRotationStatus: null,
      airSituationStatus: null,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      ammoDepotId: null,
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

  function createMaintenance(
    overrides: Partial<WeaponMaintenance> = {},
  ): WeaponMaintenance {
    return {
      id: 'maintenance-1',
      weaponSystemId: 'weapon-1',
      weaponSystem: null,
      reason: 'breakdown',
      status: 'in_progress',
      startedAt: new Date('2026-07-14T00:00:00.000Z'),
      expectedCompletedAt: null,
      completedAt: null,
      description: null,
      result: null,
      openedByUserId: 'user-1',
      completedByUserId: null,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      ...overrides,
    } as WeaponMaintenance;
  }

  function createDeployment(
    overrides: Partial<WeaponDeployment> = {},
  ): WeaponDeployment {
    return {
      id: 'deployment-1',
      weaponSystemId: 'weapon-1',
      weaponSystem: null,
      fromLocationType: 'reserve_area',
      fromLocationId: null,
      toLocationType: 'fire_position',
      toLocationId: 'fp-1',
      status: 'planned',
      orderedAt: new Date('2026-07-14T00:00:00.000Z'),
      departedAt: null,
      arrivedAt: null,
      orderedByUserId: 'user-1',
      confirmedByUserId: null,
      note: null,
      createdAt: new Date('2026-07-14T00:00:00.000Z'),
      updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      ...overrides,
    } as WeaponDeployment;
  }
});
