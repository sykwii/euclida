import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { WeaponSystem } from '../weapon-systems/weapon-system.entity';
import { DepotShellStock } from '../depot-shell-stock/depot-shell-stock.entity';
import { RecommendationsDashboard, RecommendationItem, RecommendationLevel } from './recommendations.types';

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(WeaponSystem) private readonly weapons: Repository<WeaponSystem>,
    @InjectRepository(FirePosition) private readonly positions: Repository<FirePosition>,
    @InjectRepository(ServiceOrder) private readonly orders: Repository<ServiceOrder>,
    @InjectRepository(DepotShellStock) private readonly shellStock: Repository<DepotShellStock>,
  ) {}

  async dashboard(): Promise<RecommendationsDashboard> {
    const now = new Date().toISOString();
    const items: RecommendationItem[] = [];
    const [weapons, positions, orders, shellStock] = await Promise.all([
      this.weapons.find(),
      this.positions.find(),
      this.orders.find(),
      this.shellStock.find(),
    ]);

    for (const position of positions) {
      if (!position.hasSg || position.readinessStatus !== 'ready') {
        items.push(this.item('critical', 'fire_positions', `ВП не готова: ${position.name}`, position.notReadyReason || 'На ВП немає активної СГ або статус не готовий.', 'Перевірити призначення СГ і стан ВП.', 'fire_position', position.id, now));
      }
      if (!position.mgrs) {
        items.push(this.item('warning', 'map', `Немає MGRS для ВП: ${position.name}`, 'Для позиції заповнені Decimal-координати, але немає MGRS.', 'Перезберегти ВП або заповнити MGRS.', 'fire_position', position.id, now));
      }
      if (!position.ammoDepotId) {
        items.push(this.item('warning', 'logistics', `Не назначен склад БК для ВП: ${position.name}`, 'ВП не имеет привязанного склада БК.', 'Назначить склад БК на карточке ВП.', 'fire_position', position.id, now));
      }
    }

    const activeOnPosition = weapons.filter((weapon) => weapon.locationType === 'fire_position');
    const duplicated = new Map<string, number>();
    for (const weapon of activeOnPosition) {
      if (!weapon.firePositionId) continue;
      duplicated.set(weapon.firePositionId, (duplicated.get(weapon.firePositionId) || 0) + 1);
    }
    for (const [firePositionId, count] of duplicated.entries()) {
      if (count > 1) {
        items.push(this.item('critical', 'weapon_systems', 'На одной ВП больше одной активной СГ', `fire_position_id=${firePositionId}, количество=${count}.`, 'Оставить одну активную СГ на ВП, остальные перевести в РЗ.', 'fire_position', firePositionId, now));
      }
    }

    for (const weapon of weapons) {
      if (weapon.locationType === 'fire_position' && !weapon.firePositionId) {
        items.push(this.item('critical', 'weapon_systems', `СГ на ВП без fire_position_id: ${weapon.callsign || weapon.serialNumber || weapon.id}`, 'location_type=fire_position, но fire_position_id пустой.', 'Переназначить СГ через форму или перевести в РЗ.', 'weapon_system', weapon.id, now));
      }
      if (weapon.readinessStatus !== 'ready') {
        items.push(this.item('warning', 'weapon_systems', `СГ не готова: ${weapon.callsign || weapon.serialNumber || weapon.id}`, weapon.notReadyReason || 'Причина не указана.', 'Уточнить причину неготовности или изменить статус.', 'weapon_system', weapon.id, now));
      }
    }

    const actionableStatuses = new Set(['draft', 'proposed', 'sent', 'accepted', 'in_progress']);
    for (const order of orders.filter((item) => actionableStatuses.has(item.status))) {
      if (!order.selectedFirePositionId) {
        items.push(this.item('warning', 'service_orders', `Заявка без ВП: ${order.orderNumber}`, 'Для активной заявки не выбрана ВП.', 'Открыть заявку и выбрать ВП из предложенных.', 'service_order', order.id, now));
      }
      if (!order.selectedShellId) {
        items.push(this.item('warning', 'service_orders', `Заявка без снаряда: ${order.orderNumber}`, 'Для активной заявки не выбран снаряд.', 'Выбрать снаряд и проверить наличие БК.', 'service_order', order.id, now));
      }
    }

    for (const stock of shellStock) {
      if (Number(stock.quantity) <= 0) {
        items.push(this.item('info', 'stock', 'Нулевой остаток снарядов', `Склад ${stock.depotId}, снаряд ${stock.shellId}.`, 'Проверить актуальность записи или пополнить склад.', 'depot', stock.depotId, now));
      }
    }

    return {
      generatedAt: now,
      total: items.length,
      critical: items.filter((item) => item.level === 'critical').length,
      warning: items.filter((item) => item.level === 'warning').length,
      info: items.filter((item) => item.level === 'info').length,
      items: items.sort((a, b) => this.rank(b.level) - this.rank(a.level)),
    };
  }

  private item(level: RecommendationLevel, module: string, title: string, description: string, action: string, entityType: string, entityId: string, createdAt: string): RecommendationItem {
    return { id: `${module}-${entityType}-${entityId}-${title}`.replace(/\s+/g, '-'), level, module, title, description, action, entityType, entityId, createdAt };
  }

  private rank(level: RecommendationLevel): number {
    return level === 'critical' ? 3 : level === 'warning' ? 2 : 1;
  }
}
