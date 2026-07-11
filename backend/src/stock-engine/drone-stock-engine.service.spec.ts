import { BadRequestException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.types';
import { AirAssetPosition } from '../air-assets/air-asset-position.entity';
import { Depot } from '../depots/depot.entity';
import { DroneStockMovement } from '../drone-logistics/drone-stock-movement.entity';
import { DroneStockEngineService } from './drone-stock-engine.service';
import { StockOperation } from './stock-operation.entity';

describe('DroneStockEngineService', () => {
  const user: AuthUser = {
    sub: 'user-1',
    login: 'tester',
    role: 'operator',
    scope: 'main',
    fullName: 'Tester',
    unitId: 'unit-1',
  };

  const existingMovement = { id: 'movement-1', idempotencyKey: 'idem-1' } as DroneStockMovement;

  const operations = {};
  const movements = {
    findOne: jest.fn(),
  };
  const adapter = {
    decrease: jest.fn(),
    increase: jest.fn(),
    setQuantity: jest.fn(),
  };
  const realtime = {
    emitMany: jest.fn(),
  };
  const eventLogs = {
    create: jest.fn(),
  };

  let saveMock: jest.Mock;
  let findOneMock: jest.Mock;
  let transactionMock: jest.Mock;
  let dataSource: { transaction: jest.Mock };
  let service: DroneStockEngineService;

  beforeEach(() => {
    jest.clearAllMocks();
    saveMock = jest.fn();
    findOneMock = jest.fn();
    transactionMock = jest.fn();
    dataSource = { transaction: transactionMock };
    service = new DroneStockEngineService(
      dataSource as never,
      operations as never,
      movements as never,
      adapter as never,
      realtime as never,
      eventLogs as never,
    );
  });

  it('returns existing movement for repeated idempotency key', async () => {
    movements.findOne.mockResolvedValue(existingMovement);

    const result = await service.execute(
      {
        idempotencyKey: 'idem-1',
        operationType: 'receipt',
        movementType: 'external_supply',
        resourceType: 'drone',
        resourceId: 'drone-1',
        quantity: 1,
        destination: { storageType: 'depot', storageId: 'depot-1' },
      },
      user,
    );

    expect(result).toBe(existingMovement);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(realtime.emitMany).not.toHaveBeenCalled();
  });

  it('does not emit realtime or audit when stock decrease fails', async () => {
    movements.findOne.mockResolvedValue(null);
    adapter.decrease.mockRejectedValue(new BadRequestException('Недостатньо ресурсу'));
    findOneMock.mockImplementation(
      async (entity: unknown, options: { where: { id: string } }) => {
        if (entity === DroneStockMovement) {
          return null;
        }

        if (entity === Depot && options.where.id === 'depot-1') {
          return { id: 'depot-1', depotType: 'drone_depot' };
        }

        if (entity === AirAssetPosition && options.where.id === 'asset-1') {
          return { id: 'asset-1' };
        }

        return null;
      },
    );
    saveMock.mockImplementation(async (entity: unknown, payload: unknown) => {
      if (entity === StockOperation) {
        return { id: 'op-1', ...((payload as Record<string, unknown>) ?? {}) };
      }

      return payload;
    });

    transactionMock.mockImplementation(async (callback: (manager: unknown) => Promise<unknown>) =>
      callback({
        findOne: findOneMock,
        save: saveMock,
        create: (_entity: unknown, payload: unknown) => payload,
      }),
    );

    await expect(
      service.execute(
        {
          idempotencyKey: 'idem-2',
          operationType: 'issue',
          movementType: 'depot_to_air_asset',
          resourceType: 'drone',
          resourceId: 'drone-1',
          quantity: 3,
          source: { storageType: 'depot', storageId: 'depot-1' },
          destination: { storageType: 'air_asset', storageId: 'asset-1' },
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(eventLogs.create).not.toHaveBeenCalled();
    expect(realtime.emitMany).not.toHaveBeenCalled();
  });
});
