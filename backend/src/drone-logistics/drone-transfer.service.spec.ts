import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { DroneTransferService } from './drone-transfer.service';
import type { DroneModel } from './drone-model.entity';
import type { DroneWarheadType } from './drone-warhead-type.entity';

describe('DroneTransferService', () => {
  const user: AuthUser = {
    sub: 'user-1',
    login: 'tester',
    role: 'operator',
    scope: 'main',
    fullName: 'Tester',
    unitId: 'unit-1',
  };

  const schema = {
    ensureDroneLogisticsSchema: jest.fn().mockResolvedValue(undefined),
  };

  const inventory = {
    getDepotDroneStockRow: jest.fn(),
    getDepotWarheadStockRow: jest.fn(),
    getAirAssetDroneStockRow: jest.fn(),
    getAirAssetWarheadStockRow: jest.fn(),
  };

  const droneStockEngine = {
    execute: jest.fn().mockResolvedValue({ id: 'movement-1' }),
  };

  const droneModels = {
    findOne: jest.fn<Promise<DroneModel | null>, [{ where: { id: string } }]>(),
  };

  const warheadTypes = {
    findOne: jest.fn<Promise<DroneWarheadType | null>, [{ where: { id: string } }]>(),
  };

  let service: DroneTransferService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DroneTransferService(
      droneModels as never,
      warheadTypes as never,
      schema as never,
      inventory as never,
      droneStockEngine as never,
    );
  });

  it('routes depot receipt through drone stock engine and returns depot balance row', async () => {
    droneModels.findOne.mockResolvedValue({ id: 'drone-1' } as DroneModel);
    inventory.getDepotDroneStockRow.mockResolvedValue({ id: 'stock-1', quantity: 5 });

    const result = await service.addDroneToDepot(
      { depotId: 'depot-1', droneModelId: 'drone-1', quantity: 5, comment: 'supply' },
      user,
      { idempotencyKey: 'key-1' },
    );

    expect(droneStockEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'key-1',
        operationType: 'receipt',
        movementType: 'external_supply',
        resources: [
          {
            resourceType: 'drone',
            resourceId: 'drone-1',
            quantity: 5,
            accountingUnit: 'piece',
          },
        ],
        destination: { type: 'depot', id: 'depot-1' },
        comment: 'supply',
        unitId: 'unit-1',
      }),
      user,
    );
    expect(result).toEqual({ id: 'stock-1', quantity: 5 });
  });

  it('routes depot to air asset issue through drone stock engine', async () => {
    droneModels.findOne.mockResolvedValue({ id: 'drone-1' } as DroneModel);
    inventory.getAirAssetDroneStockRow.mockResolvedValue({ id: 'stock-2', quantity: 2 });

    await service.transferDroneToAirAsset(
      {
        depotId: 'depot-1',
        airAssetPositionId: 'asset-1',
        droneModelId: 'drone-1',
        quantity: 2,
      },
      user,
      { idempotencyKey: 'key-2' },
    );

    expect(droneStockEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'key-2',
        operationType: 'issue',
        movementType: 'depot_to_air_asset',
        resources: [
          {
            resourceType: 'drone',
            resourceId: 'drone-1',
            quantity: 2,
            accountingUnit: 'piece',
          },
        ],
        source: { type: 'depot', id: 'depot-1' },
        destination: { type: 'air_asset', id: 'asset-1' },
      }),
      user,
    );
  });

  it('supports air asset to depot return through stock engine', async () => {
    warheadTypes.findOne.mockResolvedValue({
      id: 'warhead-1',
      measureUnit: 'unit',
    } as DroneWarheadType);
    inventory.getDepotWarheadStockRow.mockResolvedValue({ id: 'stock-3', quantity: 4 });

    await service.returnWarheadToDepot(
      'asset-1',
      'depot-1',
      'warhead-1',
      4,
      user,
      { idempotencyKey: 'key-3' },
    );

    expect(droneStockEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'key-3',
        operationType: 'return',
        movementType: 'air_asset_to_depot',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: 'warhead-1',
            quantity: 4,
            accountingUnit: 'piece',
          },
        ],
        source: { type: 'air_asset', id: 'asset-1' },
        destination: { type: 'depot', id: 'depot-1' },
      }),
      user,
    );
  });

  it('supports correction with zero quantity for warheads', async () => {
    warheadTypes.findOne.mockResolvedValue({
      id: 'warhead-1',
      measureUnit: 'kg',
    } as DroneWarheadType);
    inventory.getAirAssetWarheadStockRow.mockResolvedValue({ id: 'stock-4', quantity: 0 });

    await service.correctAirAssetWarheadStock(
      'asset-1',
      { warheadTypeId: 'warhead-1', quantity: 0 },
      user,
      { idempotencyKey: 'key-4' },
    );

    expect(droneStockEngine.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'key-4',
        operationType: 'correction',
        movementType: 'correction',
        resources: [
          {
            resourceType: 'warhead',
            resourceId: 'warhead-1',
            quantity: 0,
            accountingUnit: 'piece',
          },
        ],
        destination: { type: 'air_asset', id: 'asset-1' },
        comment: null,
        unitId: 'unit-1',
      }),
      user,
    );
  });

  it('rejects invalid integer drone quantity before engine call', async () => {
    droneModels.findOne.mockResolvedValue({ id: 'drone-1' } as DroneModel);

    await expect(
      service.addDroneToDepot(
        { depotId: 'depot-1', droneModelId: 'drone-1', quantity: 0 },
        user,
        { idempotencyKey: 'key-5' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(droneStockEngine.execute).not.toHaveBeenCalled();
  });
});
