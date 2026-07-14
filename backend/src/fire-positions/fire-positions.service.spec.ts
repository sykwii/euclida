import { FirePositionsService } from './fire-positions.service';
import { FirePosition } from './fire-position.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { WeaponDeployment } from '../weapon-systems/weapon-deployment.entity';
import type { AuthUser } from '../auth/auth-user.types';

describe('FirePositionsService OPS-1 aggregate readiness', () => {
  const user: AuthUser = {
    sub: 'user-1',
    login: 'operator',
    role: 'operator',
    scope: 'battery',
    fullName: 'Operator',
    unitId: 'unit-1',
  };

  function createService(
    firePosition: FirePosition,
    assignedWeapon: WeaponSystem | null,
  ): FirePositionsService {
    const firePositionRepository = {
      find: jest.fn(async () => [firePosition]),
      findOne: jest.fn(async () => firePosition),
      save: jest.fn(async (item: FirePosition) => item),
      remove: jest.fn(),
    };
    const weaponRepository = {
      findOne: jest.fn(async () => assignedWeapon),
    };
    const deploymentRepository = {
      findOne: jest.fn(async () => null),
    };
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WeaponSystem) return weaponRepository;
        if (entity === WeaponDeployment) return deploymentRepository;
        if (entity === FirePosition) return firePositionRepository;
        return { find: jest.fn(async () => []), findOne: jest.fn(async () => null) };
      }),
      transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) =>
        callback({
          getRepository: () => firePositionRepository,
          save: async (_entity: unknown, item: unknown) => item,
        }),
      ),
      query: jest.fn(async () => []),
    };

    return new FirePositionsService(
      firePositionRepository as never,
      {
        getAllowedUnitIds: jest.fn(async () => ['unit-1']),
        canAccessUnit: jest.fn(async () => true),
      } as never,
      dataSource as never,
      { emitMany: jest.fn() } as never,
      { create: jest.fn(async () => undefined) } as never,
    );
  }

  it('shows arrived weapon while fire position remains not combat ready', async () => {
    const service = createService(
      createFirePosition({ readinessStatus: 'not_combat_ready', notReadyReason: 'not_prepared' }),
      createWeapon(),
    );

    const [item] = await service.findAll(user);

    expect(item.assignedWeapon?.id).toBe('weapon-1');
    expect(item.readinessStatus).toBe('not_combat_ready');
    expect(item.aggregateReady).toBe(false);
    expect(item.aggregateReadinessReasons).toContain('fp_not_prepared');
  });

  it('marks aggregate ready only when fire position and weapon are ready', async () => {
    const service = createService(createFirePosition({ readinessStatus: 'combat_ready' }), createWeapon());

    const [item] = await service.findAll(user);

    expect(item.aggregateReady).toBe(true);
    expect(item.aggregateReadinessReasons).toEqual([]);
  });

  it('keeps aggregate not ready when weapon is not combat ready', async () => {
    const service = createService(
      createFirePosition({ readinessStatus: 'combat_ready' }),
      createWeapon({ readinessStatus: 'not_combat_ready' }),
    );

    const [item] = await service.findAll(user);

    expect(item.aggregateReady).toBe(false);
    expect(item.aggregateReadinessReasons).toContain('weapon_not_ready');
  });

  it('reports missing weapon after withdrawal', async () => {
    const service = createService(createFirePosition({ readinessStatus: 'combat_ready' }), null);

    const [item] = await service.findAll(user);

    expect(item.assignedWeapon).toBeNull();
    expect(item.aggregateReady).toBe(false);
    expect(item.aggregateReadinessReasons).toContain('weapon_missing');
  });

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
      readinessStatus: 'not_combat_ready',
      notReadyReason: 'not_prepared',
      completedVgzCount: 0,
      personnelRotationStatus: null,
      airSituationStatus: null,
      createdAt: new Date(),
      updatedAt: new Date(),
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
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      currentFirePosition: null,
      maintenanceStatus: null,
      maintenanceRequestedStartAt: null,
      maintenancePlannedEndAt: null,
      maintenanceActualEndAt: null,
      maintenanceNote: null,
      maintenanceRequestedByUserId: null,
      maintenanceApprovedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      locationType: 'reserve',
      firePositionId: null,
      firePosition: null,
      maintenances: [],
      deployments: [],
      ...overrides,
    } as WeaponSystem;
  }
});
