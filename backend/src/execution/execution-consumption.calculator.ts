import { Injectable } from '@nestjs/common';
import type { StockResourceRef } from '../stock-engine/stock-resource.types';
import type { ExecutionPipelineContext } from './execution-pipeline-context.type';

@Injectable()
export class ExecutionConsumptionCalculator {
  calculate(context: ExecutionPipelineContext): StockResourceRef[] {
    if (!context.artillerySnapshot) {
      return [];
    }

    const shotCount = Number(context.body.quantity);

    return [
      {
        resourceType: 'shell',
        resourceId: context.artillerySnapshot.shellId,
        quantity: this.normalizeQuantity(shotCount),
        accountingUnit: 'piece',
      },
      {
        resourceType: 'fuze',
        resourceId: context.artillerySnapshot.fuzeId,
        quantity: this.normalizeQuantity(shotCount),
        accountingUnit: 'piece',
      },
      {
        resourceType: 'primer',
        resourceId: context.artillerySnapshot.primerId,
        quantity: this.normalizeQuantity(shotCount),
        accountingUnit: 'piece',
      },
      ...context.artillerySnapshot.charges.map((component) => ({
        resourceType: 'charge' as const,
        resourceId: component.chargeId,
        quantity: this.normalizeQuantity(
          shotCount * component.quantityPerShot,
        ),
        accountingUnit: component.accountingUnit,
      })),
    ];
  }

  private normalizeQuantity(value: number): number {
    return Number(value.toFixed(3));
  }
}
