import { DataSource } from 'typeorm';
import { Charge } from '../charges/charge.entity';
import { DepotChargeStock } from '../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { ShotConfiguration } from '../shot-configurations/shot-configuration.entity';
import { ShotConfigurationCharge } from '../shot-configurations/shot-configuration-charge.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { ServiceOrderSuggestionsService } from './service-order-suggestions.service';

type PrivateSuggestionsApi = {
  findResourcePairs: (
    firePositionId: string,
    depotId: string,
    distanceM: number,
    plannedQuantity: number,
  ) => Promise<{
    variants: Array<{
      weaponModelId: string;
      shotConfigurationId: string;
      rejectionReasons: string[];
    }>;
    rejectionReasons: string[];
    weaponSystems: WeaponSystem[];
  }>;
};

describe('ServiceOrderSuggestionsService shot kit variants', () => {
  it('uses canonical arrived weapon assignment to return active shot kits', async () => {
    const service = createService({
      weapons: [
        {
          id: 'weapon-1',
          weaponModelId: 'model-1',
          currentFirePositionId: 'fp-1',
          deploymentStatus: 'at_fire_position',
          readinessStatus: 'combat_ready',
          weaponModel: { id: 'model-1', name: 'M777' },
        } as WeaponSystem,
      ],
      configurations: [createConfiguration({ weaponModelId: 'model-1' })],
    });

    const result = await service.findResourcePairs('fp-1', 'depot-1', 5000, 2);

    expect(result.variants).toHaveLength(1);
    expect(result.variants[0].shotConfigurationId).toBe('kit-1');
    expect(result.variants[0].weaponModelId).toBe('model-1');
    expect(result.variants[0].rejectionReasons).toEqual([]);
    expect(result.weaponSystems[0].id).toBe('weapon-1');
  });

  it('excludes wrong weapon model kits with an explicit reason', async () => {
    const service = createService({
      weapons: [
        {
          id: 'weapon-1',
          weaponModelId: 'model-1',
          currentFirePositionId: 'fp-1',
          deploymentStatus: 'at_fire_position',
          readinessStatus: 'combat_ready',
          weaponModel: { id: 'model-1', name: 'M777' },
        } as WeaponSystem,
      ],
      configurations: [createConfiguration({ id: 'kit-2', weaponModelId: 'model-2' })],
    });

    const result = await service.findResourcePairs('fp-1', 'depot-1', 5000, 2);

    expect(result.variants).toHaveLength(0);
    expect(result.rejectionReasons).toContain('Для моделі СГ немає комплектів пострілу');
  });

  it('loads each stock category once for all candidate depots', async () => {
    const findByEntity = new Map<unknown, jest.Mock>();
    for (const entity of [
      DepotShellStock,
      DepotChargeStock,
      DepotFuzeStock,
      DepotPrimerStock,
    ]) {
      findByEntity.set(entity, jest.fn(async () => []));
    }
    const dataSource = {
      getRepository: (entity: unknown) => ({
        find: findByEntity.get(entity),
      }),
    } as unknown as DataSource;
    const service = new ServiceOrderSuggestionsService(dataSource) as unknown as {
      loadStockByDepot: (depotIds: string[]) => Promise<unknown>;
    };

    await service.loadStockByDepot(['depot-1', 'depot-2', 'depot-3']);

    expect(
      Array.from(findByEntity.values()).reduce(
        (count, find) => count + find.mock.calls.length,
        0,
      ),
    ).toBe(4);
    for (const find of findByEntity.values()) {
      expect(find).toHaveBeenCalledTimes(1);
    }
  });
});

function createService(data: {
  weapons: WeaponSystem[];
  configurations: ShotConfiguration[];
}): PrivateSuggestionsApi {
  const dataSource = {
    getRepository: (entity: unknown) => {
      if (entity === WeaponSystem) {
        return { find: jest.fn(async () => data.weapons) };
      }

      if (entity === ShotConfiguration) {
        return {
          find: jest.fn(async (options: { where?: Array<{ weaponModelId: string }> }) => {
            const modelIds = new Set(options.where?.map((item) => item.weaponModelId) ?? []);
            return data.configurations.filter((item) => modelIds.has(item.weaponModelId));
          }),
        };
      }

      if (entity === DepotShellStock) {
        return { find: jest.fn(async () => [{ shellId: 'shell-1', quantity: 10 }]) };
      }

      if (entity === DepotChargeStock) {
        return { find: jest.fn(async () => [{ chargeId: 'charge-1', quantity: 20 }]) };
      }

      if (entity === DepotFuzeStock) {
        return { find: jest.fn(async () => [{ fuzeId: 'fuze-1', quantity: 10 }]) };
      }

      if (entity === DepotPrimerStock) {
        return { find: jest.fn(async () => [{ primerId: 'primer-1', quantity: 10 }]) };
      }

      return { find: jest.fn(async () => []) };
    },
  } as unknown as DataSource;

  return new ServiceOrderSuggestionsService(dataSource) as unknown as PrivateSuggestionsApi;
}

function createConfiguration(
  overrides: Partial<ShotConfiguration> = {},
): ShotConfiguration {
  const charge = {
    id: 'charge-1',
    marking: 'M4A2',
    chargeKind: 'unit',
  } as Charge;
  const component = {
    chargeId: 'charge-1',
    quantityPerShot: 2,
    sortOrder: 0,
    accountingUnit: 'piece',
    charge,
  } as ShotConfigurationCharge;

  return {
    id: 'kit-1',
    name: 'Kit 1',
    weaponModelId: 'model-1',
    shellId: 'shell-1',
    shell: { id: 'shell-1', marking: 'M107' },
    fuzeId: 'fuze-1',
    fuze: { id: 'fuze-1', marking: 'DM84' },
    primerId: 'primer-1',
    primer: { id: 'primer-1', marking: 'M100' },
    zoneId: null,
    zoneNumber: 6,
    maxRangeM: 17000,
    isActive: true,
    charges: [component],
    ...overrides,
  } as ShotConfiguration;
}
