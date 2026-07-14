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
    options: {
      incomingDeployment?: WeaponDeployment | null;
      legacyWeapon?: WeaponSystem | null;
      allowedUnitIds?: string[];
      canAccessUnit?: boolean;
    } = {},
  ): FirePositionsService {
    const firePositionRepository = {
      find: jest.fn(async () => [firePosition]),
      findOne: jest.fn(async () => firePosition),
      save: jest.fn(async (item: FirePosition) => item),
      remove: jest.fn(),
    };
    const weaponRepository = {
      find: jest.fn(async () => (assignedWeapon ? [assignedWeapon] : [])),
      findOne: jest.fn(async (query: { where?: Partial<WeaponSystem> }) => {
        const where = query.where;
        if (where?.currentFirePositionId !== undefined) {
          return assignedWeapon;
        }
        if (where?.firePositionId !== undefined) {
          return options.legacyWeapon ?? null;
        }
        return assignedWeapon;
      }),
    };
    const deploymentRepository = {
      find: jest.fn(async () =>
        options.incomingDeployment ? [options.incomingDeployment] : [],
      ),
      findOne: jest.fn(async () => options.incomingDeployment ?? null),
    };
    const dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === WeaponSystem) return weaponRepository;
        if (entity === WeaponDeployment) return deploymentRepository;
        if (entity === FirePosition) return firePositionRepository;
        return { find: jest.fn(async () => []), findOne: jest.fn(async () => null) };
      }),
      transaction: jest.fn(async (callback: (manager: {
        getRepository: (entity: unknown) => unknown;
        save: (entity: unknown, item: unknown) => Promise<unknown>;
      }) => Promise<unknown>) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === WeaponSystem) return weaponRepository;
            if (entity === WeaponDeployment) return deploymentRepository;
            return firePositionRepository;
          },
          save: async (_entity: unknown, item: unknown) => item,
        }),
      ),
      query: jest.fn(async () => []),
    };

    return new FirePositionsService(
      firePositionRepository as never,
      {
        getAllowedUnitIds: jest.fn(async () => options.allowedUnitIds ?? ['unit-1']),
        canAccessUnit: jest.fn(async () => options.canAccessUnit ?? true),
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

  it('returns assigned weapon for null-unit fire position with canonical arrived weapon unit', async () => {
    const service = createService(
      createFirePosition({ unitId: null, readinessStatus: 'combat_ready' }),
      createWeapon({ unitId: 'unit-1' }),
    );

    const [item] = await service.findAll(user);

    expect(item.isOwnScope).toBe(true);
    expect(item.assignedWeapon?.id).toBe('weapon-1');
    expect(item.unitId).toBe('unit-1');
  });

  it('shows null-unit fire position on map when canonical arrived weapon belongs to scope', async () => {
    const service = createService(
      createFirePosition({ unitId: null, readinessStatus: 'combat_ready' }),
      createWeapon({ unitId: 'unit-1' }),
    );

    const [item] = await service.findAllForMap(user);

    expect(item.assignedWeapon?.id).toBe('weapon-1');
    expect(item.unitId).toBe('unit-1');
  });

  it('backfills fire-position unit from canonical arrived weapon on readiness confirmation', async () => {
    const firePosition = createFirePosition({ unitId: null });
    const service = createService(firePosition, createWeapon({ unitId: 'unit-1' }));

    const result = await service.confirmReadiness(
      'fp-1',
      { readinessStatus: 'combat_ready' },
      user,
    );

    expect(result.unitId).toBe('unit-1');
    expect(result.readinessStatus).toBe('combat_ready');
  });

  it('rejects readiness confirmation for mismatching scope', async () => {
    const service = createService(
      createFirePosition({ unitId: null }),
      createWeapon({ unitId: 'unit-2' }),
      { canAccessUnit: false },
    );

    await expect(
      service.confirmReadiness('fp-1', { readinessStatus: 'combat_ready' }, user),
    ).rejects.toThrow('Немає доступу до цього підрозділу');
  });

  it('returns explicit error when fire position and arrived weapon both have no unit', async () => {
    const service = createService(
      createFirePosition({ unitId: null }),
      createWeapon({ unitId: null }),
    );

    await expect(
      service.confirmReadiness('fp-1', { readinessStatus: 'combat_ready' }, user),
    ).rejects.toThrow('Не визначено підрозділ ВП');
  });

  it('does not authorize readiness confirmation from planned incoming weapon', async () => {
    const service = createService(
      createFirePosition({ unitId: null }),
      null,
      {
        incomingDeployment: createDeployment(createWeapon({ unitId: 'unit-1' })),
      },
    );

    await expect(
      service.confirmReadiness('fp-1', { readinessStatus: 'combat_ready' }, user),
    ).rejects.toThrow('Не визначено підрозділ ВП');
  });

  it('does not leak cross-unit fire position on map', async () => {
    const service = createService(
      createFirePosition({ unitId: null }),
      createWeapon({ unitId: 'unit-2' }),
      { allowedUnitIds: ['unit-1'] },
    );

    const items = await service.findAllForMap(user);

    expect(items).toEqual([]);
  });

  it('keeps legacy assigned weapon readable for historical positions', async () => {
    const service = createService(
      createFirePosition({ unitId: 'unit-1' }),
      null,
      {
        legacyWeapon: createWeapon({
          currentFirePositionId: null,
          deploymentStatus: 'reserve_area',
          firePositionId: 'fp-1',
          locationType: 'fire_position',
        }),
      },
    );

    const [item] = await service.findAll(user);

    expect(item.assignedWeapon?.firePositionId).toBe('fp-1');
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

  function createDeployment(weapon: WeaponSystem): WeaponDeployment {
    return {
      id: 'deployment-1',
      weaponSystemId: weapon.id,
      weaponSystem: weapon,
      fromLocationType: 'reserve_area',
      fromLocationId: null,
      toLocationType: 'fire_position',
      toLocationId: 'fp-1',
      status: 'planned',
      orderedAt: new Date(),
      departedAt: null,
      arrivedAt: null,
      orderedByUserId: user.sub,
      confirmedByUserId: null,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
});
