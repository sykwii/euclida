import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { DepotDroneStock } from '../../drone-logistics/depot-drone-stock.entity';
import { DepotDroneWarheadStock } from '../../drone-logistics/depot-drone-warhead-stock.entity';
import type { LockedStockBalance, StockAdapter } from '../stock-adapter.interface';
import type { StockAccountingUnit, StockResourceType } from '../stock-resource.types';

type DroneStock = DepotDroneStock | DepotDroneWarheadStock;

@Injectable()
export class DroneStockAdapter implements StockAdapter {
  supports(type: StockResourceType): boolean { return type === 'drone' || type === 'warhead'; }
  async defaultAccountingUnit(): Promise<StockAccountingUnit> { return 'piece'; }

  async lockBalance(manager: EntityManager, depotId: string, type: StockResourceType, resourceId: string): Promise<LockedStockBalance | null> {
    const cfg = this.config(type);
    const row = await manager.getRepository(cfg.entity).createQueryBuilder('stock').setLock('pessimistic_write')
      .where('stock.depot_id = :depotId', { depotId }).andWhere(`stock.${cfg.itemColumnSql} = :resourceId`, { resourceId }).getOne() as DroneStock | null;
    return row ? { depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: 'piece' } : null;
  }

  async increase(manager: EntityManager, depotId: string, type: StockResourceType, resourceId: string, quantity: number): Promise<LockedStockBalance> {
    const cfg = this.config(type); const repo = manager.getRepository(cfg.entity);
    let row = await repo.createQueryBuilder('stock').setLock('pessimistic_write').where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${cfg.itemColumnSql} = :resourceId`, { resourceId }).getOne() as DroneStock | null;
    if (!row) row = repo.create({ depotId, [cfg.itemProperty]: resourceId, quantity: 0 } as ObjectLiteral) as DroneStock;
    row.quantity = Number(row.quantity) + quantity; await manager.save(cfg.entity, row);
    return { depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: 'piece' };
  }

  async decrease(manager: EntityManager, depotId: string, type: StockResourceType, resourceId: string, quantity: number): Promise<LockedStockBalance> {
    const cfg = this.config(type);
    const row = await manager.getRepository(cfg.entity).createQueryBuilder('stock').setLock('pessimistic_write')
      .where('stock.depot_id = :depotId', { depotId }).andWhere(`stock.${cfg.itemColumnSql} = :resourceId`, { resourceId }).getOne() as DroneStock | null;
    if (!row) throw new BadRequestException('На складі немає такого ресурсу');
    const current = Number(row.quantity); if (current < quantity) throw new BadRequestException(`Недостатньо ресурсу. Доступно: ${current}, потрібно: ${quantity}`);
    row.quantity = current - quantity; await manager.save(cfg.entity, row);
    return { depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: 'piece' };
  }

  async listByDepot(manager: EntityManager, depotId: string): Promise<LockedStockBalance[]> {
    const result: LockedStockBalance[] = [];
    for (const type of ['drone', 'warhead'] as StockResourceType[]) {
      const cfg = this.config(type); const rows = await manager.getRepository(cfg.entity).find({ where: { depotId } as never }) as DroneStock[];
      for (const row of rows) result.push({ depotId, resourceType: type, resourceId: String((row as unknown as Record<string, unknown>)[cfg.itemProperty]), quantity: Number(row.quantity), accountingUnit: 'piece' });
    }
    return result;
  }

  private config(type: StockResourceType): { entity: EntityTarget<DroneStock>; itemProperty: string; itemColumnSql: string } {
    if (type === 'drone') return { entity: DepotDroneStock, itemProperty: 'droneModelId', itemColumnSql: 'drone_model_id' };
    if (type === 'warhead') return { entity: DepotDroneWarheadStock, itemProperty: 'warheadTypeId', itemColumnSql: 'warhead_type_id' };
    throw new BadRequestException('Непідтримуваний тип ресурсу БпЛА');
  }
}
