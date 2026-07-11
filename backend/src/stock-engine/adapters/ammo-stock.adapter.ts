import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { Charge } from '../../charges/charge.entity';
import { DepotChargeStock } from '../../depot-charge-stock/depot-charge-stock.entity';
import { DepotFuzeStock } from '../../depot-fuze-stock/depot-fuze-stock.entity';
import { DepotPrimerStock } from '../../depot-primer-stock/depot-primer-stock.entity';
import { DepotShellStock } from '../../depot-shell-stock/depot-shell-stock.entity';
import type { LockedStockBalance, StockAdapter } from '../stock-adapter.interface';
import type { StockAccountingUnit, StockResourceType } from '../stock-resource.types';

type AmmoStock = DepotShellStock | DepotChargeStock | DepotFuzeStock | DepotPrimerStock;

@Injectable()
export class AmmoStockAdapter implements StockAdapter {
  supports(type: StockResourceType): boolean {
    return ['shell', 'charge', 'fuze', 'primer'].includes(type);
  }

  async defaultAccountingUnit(type: StockResourceType, resourceId: string, manager: EntityManager): Promise<StockAccountingUnit> {
    if (type !== 'charge') return 'piece';
    const charge = await manager.findOne(Charge, { where: { id: resourceId } });
    if (!charge) throw new BadRequestException('Заряд не знайдено');
    const raw = String((charge as unknown as { measurementUnit?: string; chargeKind?: string }).measurementUnit || (charge as unknown as { chargeKind?: string }).chargeKind || '').toLowerCase();
    return raw.includes('modul') || raw.includes('модул') ? 'module' : 'piece';
  }

  async lockBalance(manager: EntityManager, depotId: string, type: StockResourceType, resourceId: string): Promise<LockedStockBalance | null> {
    const cfg = this.config(type);
    const row = await manager.getRepository(cfg.entity).createQueryBuilder('stock')
      .setLock('pessimistic_write')
      .where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${cfg.itemColumnSql} = :resourceId`, { resourceId })
      .getOne() as AmmoStock | null;
    if (!row) return null;
    return { depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: await this.defaultAccountingUnit(type, resourceId, manager) };
  }

  async increase(manager: EntityManager, depotId: string, type: StockResourceType, resourceId: string, quantity: number): Promise<LockedStockBalance> {
    const cfg = this.config(type);
    const repo = manager.getRepository(cfg.entity);
    let row = await repo.createQueryBuilder('stock').setLock('pessimistic_write')
      .where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${cfg.itemColumnSql} = :resourceId`, { resourceId }).getOne() as AmmoStock | null;
    if (!row) row = repo.create({ depotId, [cfg.itemProperty]: resourceId, quantity: 0 } as ObjectLiteral) as AmmoStock;
    row.quantity = Number(row.quantity) + quantity;
    await manager.save(cfg.entity, row);
    return { depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: await this.defaultAccountingUnit(type, resourceId, manager) };
  }

  async decrease(manager: EntityManager, depotId: string, type: StockResourceType, resourceId: string, quantity: number): Promise<LockedStockBalance> {
    const cfg = this.config(type);
    const row = await manager.getRepository(cfg.entity).createQueryBuilder('stock').setLock('pessimistic_write')
      .where('stock.depot_id = :depotId', { depotId })
      .andWhere(`stock.${cfg.itemColumnSql} = :resourceId`, { resourceId }).getOne() as AmmoStock | null;
    if (!row) throw new BadRequestException('На складі немає такого ресурсу');
    const current = Number(row.quantity);
    if (current < quantity) throw new BadRequestException(`Недостатньо ресурсу. Доступно: ${current}, потрібно: ${quantity}`);
    row.quantity = current - quantity;
    await manager.save(cfg.entity, row);
    return { depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: await this.defaultAccountingUnit(type, resourceId, manager) };
  }

  async listByDepot(manager: EntityManager, depotId: string): Promise<LockedStockBalance[]> {
    const result: LockedStockBalance[] = [];
    for (const type of ['shell', 'charge', 'fuze', 'primer'] as StockResourceType[]) {
      const cfg = this.config(type);
      const rows = await manager.getRepository(cfg.entity).find({ where: { depotId } as never }) as AmmoStock[];
      for (const row of rows) {
        const resourceId = String((row as unknown as Record<string, unknown>)[cfg.itemProperty]);
        result.push({ depotId, resourceType: type, resourceId, quantity: Number(row.quantity), accountingUnit: await this.defaultAccountingUnit(type, resourceId, manager) });
      }
    }
    return result;
  }

  private config(type: StockResourceType): { entity: EntityTarget<AmmoStock>; itemProperty: string; itemColumnSql: string } {
    switch (type) {
      case 'shell': return { entity: DepotShellStock, itemProperty: 'shellId', itemColumnSql: 'shell_id' };
      case 'charge': return { entity: DepotChargeStock, itemProperty: 'chargeId', itemColumnSql: 'charge_id' };
      case 'fuze': return { entity: DepotFuzeStock, itemProperty: 'fuzeId', itemColumnSql: 'fuze_id' };
      case 'primer': return { entity: DepotPrimerStock, itemProperty: 'primerId', itemColumnSql: 'primer_id' };
      default: throw new BadRequestException('Непідтримуваний тип ресурсу БК');
    }
  }
}
