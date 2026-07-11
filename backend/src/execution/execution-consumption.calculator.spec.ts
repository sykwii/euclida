import type { AuthUser } from '../auth/auth-user.types';
import { ExecutionConsumptionCalculator } from './execution-consumption.calculator';
import type { ExecutionPipelineContext } from './execution-pipeline-context.type';
import type { ServiceOrder } from '../service-orders/service-order.entity';

describe('ExecutionConsumptionCalculator', () => {
  it('builds normalized mixed artillery consumption', () => {
    const calculator = new ExecutionConsumptionCalculator();

    const context: ExecutionPipelineContext = {
      serviceOrderId: 'order-1',
      serviceOrder: { id: 'order-1' } as ServiceOrder,
      body: {
        idempotencyKey: 'idem-1',
        executionType: 'artillery',
        purpose: 'main',
        result: 'executed',
        startedAt: '2026-07-11T10:00:00.000Z',
        quantity: 3,
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
              chargeId: 'charge-a',
              chargeName: 'A',
              quantityPerShot: 1,
              accountingUnit: 'module',
              sortOrder: 1,
            },
            {
              chargeId: 'charge-b',
              chargeName: 'B',
              quantityPerShot: 2,
              accountingUnit: 'module',
              sortOrder: 2,
            },
          ],
        },
      },
      user: { sub: 'user-1' } as AuthUser,
      handler: { supports: () => true, validate: () => undefined, buildArtillerySnapshot: () => null },
      unitId: 'unit-1',
      startedAt: new Date('2026-07-11T10:00:00.000Z'),
      completedAt: null,
      executorSnapshot: {},
      resourceSnapshot: {},
      artillerySnapshot: {
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
            chargeId: 'charge-a',
            chargeNameSnapshot: 'A',
            quantityPerShot: 1,
            accountingUnit: 'module',
            sortOrder: 1,
          },
          {
            chargeId: 'charge-b',
            chargeNameSnapshot: 'B',
            quantityPerShot: 2,
            accountingUnit: 'module',
            sortOrder: 2,
          },
        ],
      },
      consumption: [],
      stockOperation: null,
      existingRecord: null,
    };

    expect(calculator.calculate(context)).toEqual([
      {
        resourceType: 'shell',
        resourceId: 'shell-1',
        quantity: 3,
        accountingUnit: 'piece',
      },
      {
        resourceType: 'fuze',
        resourceId: 'fuze-1',
        quantity: 3,
        accountingUnit: 'piece',
      },
      {
        resourceType: 'primer',
        resourceId: 'primer-1',
        quantity: 3,
        accountingUnit: 'piece',
      },
      {
        resourceType: 'charge',
        resourceId: 'charge-a',
        quantity: 3,
        accountingUnit: 'module',
      },
      {
        resourceType: 'charge',
        resourceId: 'charge-b',
        quantity: 6,
        accountingUnit: 'module',
      },
    ]);
  });
});
