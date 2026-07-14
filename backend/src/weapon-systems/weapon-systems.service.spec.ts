import { BadRequestException } from '@nestjs/common';
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

type RepoMock<T> = Pick<Repository<T>, 'findOne' | 'find' | 'save' | 'update' | 'remove'>;
type ManagerMock = {
  getRepository: jest.Mock<RepoMock<unknown>, [unknown]>;
  create: jest.Mock<unknown, [unknown, unknown]>;
  save: jest.Mock<Promise<unknown>, [unknown, unknown]>;
};
type DataSourceMock = Pick<DataSource, 'transaction' | 'query' | 'getRepository'>;

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
        if (entity === WeaponSystem) return weaponRepository as RepoMock<unknown>;
        if (entity === WeaponMaintenance) return maintenanceRepository as RepoMock<unknown>;
        if (entity === WeaponDeployment) return deploymentRepository as RepoMock<unknown>;
        if (entity === FirePosition) return firePositionRepository as RepoMock<unknown>;
        if (entity === ServiceOrder) return serviceOrderRepository as RepoMock<unknown>;
        throw new Error('Unexpected repository');
      }),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
    };

    dataSource = {
      transaction: jest.fn(async (callback: (tx: ManagerMock) => Promise<unknown>) =>
        callback(manager),
      ),
      query: jest.fn(),
      getRepository: jest.fn((entity: unknown) => manager.getRepository(entity)),
    };

    service = new WeaponSystemsService(
      weaponRepository as Repository<WeaponSystem>,
      { canAccessUnit: jest.fn(async () => true), getAllowedUnitIds: jest.fn() } as unknown as AccessScopeService,
      { emitMany: jest.fn() } as unknown as RealtimeEventsService,
      { create: jest.fn(async () => undefined) } as unknown as EventLogsService,
      dataSource as DataSource,
    );
  });

  it('requires explicit confirmation before assigning a not combat ready weapon', async () => {
    weaponRepository.findOne.mockResolvedValueOnce(
      createWeapon({ readinessStatus: 'not_combat_ready' }),
    );
    firePositionRepository.findOne.mockResolvedValueOnce(createFirePosition());

    await expect(
      service.assignToFirePosition(
        'weapon-1',
        { targetFirePositionId: 'fp-1', force: false },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate fire position occupancy', async () => {
    weaponRepository.findOne
      .mockResolvedValueOnce(createWeapon({ readinessStatus: 'combat_ready' }))
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

  it('blocks withdrawal while a fire position has active execution', async () => {
    weaponRepository.findOne.mockResolvedValueOnce(
      createWeapon({
        deploymentStatus: 'at_fire_position',
        currentFirePositionId: 'fp-1',
        firePositionId: 'fp-1',
        locationType: 'fire_position',
      }),
    );
    serviceOrderRepository.findOne.mockResolvedValueOnce({ id: 'order-1' } as ServiceOrder);

    await expect(service.moveToReserve('weapon-1', user)).rejects.toBeInstanceOf(
      BadRequestException,
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

  function createFirePosition(overrides: Partial<FirePosition> = {}): FirePosition {
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
});
