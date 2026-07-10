import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { Unit } from './unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { UnitType } from './unit-type.enum';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,

    @InjectRepository(Depot)
    private readonly depotsRepository: Repository<Depot>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Unit[]> {
    return this.unitsRepository.find({
      relations: {
        parent: true,
      },
      order: {
        sortOrder: 'ASC',
        name: 'ASC',
      },
    });
  }

  async findOne(id: string): Promise<Unit> {
    const unit = await this.unitsRepository.findOne({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException('Підрозділ не знайдено');
    }

    return unit;
  }

  async create(data: CreateUnitDto): Promise<Unit> {
    const unit = this.unitsRepository.create(data);
    const saved = await this.unitsRepository.save(unit);
    await this.ensurePasForUnit(saved);
    this.emitReferenceChanged('created', saved.id);
    return saved;
  }

  async update(id: string, data: UpdateUnitDto): Promise<Unit> {
    const unit = await this.findOne(id);
    Object.assign(unit, data);
    const saved = await this.unitsRepository.save(unit);
    await this.ensurePasForUnit(saved);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const unit = await this.findOne(id);

    const childrenCount = await this.unitsRepository.count({
      where: { parentId: id },
    });
    if (childrenCount > 0) {
      throw new BadRequestException('Підрозділ має дочірні підрозділи');
    }

    const depotsCount = await this.depotsRepository.count({
      where: { unitId: id, isArchived: false },
    });
    if (depotsCount > 0) {
      throw new BadRequestException(
        'Підрозділ має ПАС або склад. Спочатку архівуйте склад',
      );
    }

    await this.unitsRepository.remove(unit);
    this.emitReferenceChanged('deleted', id);
  }

  async removeWithRelated(id: string): Promise<void> {
    await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      const unitIds = await this.collectUnitTreeIds(id, manager);
      const depots = await manager.getRepository(Depot).find({
        where: {
          unitId: In(unitIds),
        },
      });
      const depotIds = depots.map((depot) => depot.id);

      await this.detachUnitReferences(manager, unitIds);
      await this.archiveRelatedDepots(manager, depotIds);

      for (const unitId of [...unitIds].reverse()) {
        await manager.delete(Unit, unitId);
      }
    });

    this.realtimeEvents.emitMany(
      ['reference', 'users', 'stock', 'map', 'analytics', 'events'],
      'deleted',
      {
        entity: 'unit',
        id,
        unitId: id,
      },
    );
  }

  async findChildren(parentId: string): Promise<Unit[]> {
    return this.unitsRepository.find({
      where: {
        parentId,
      },
      order: {
        sortOrder: 'ASC',
      },
    });
  }

  private async collectUnitTreeIds(
    id: string,
    manager: EntityManager,
  ): Promise<string[]> {
    const units = await manager.getRepository(Unit).find({
      order: {
        sortOrder: 'ASC',
        name: 'ASC',
      },
    });
    const childrenByParent = new Map<string, Unit[]>();

    for (const unit of units) {
      if (!unit.parentId) continue;
      const children = childrenByParent.get(unit.parentId) ?? [];
      children.push(unit);
      childrenByParent.set(unit.parentId, children);
    }

    const result: string[] = [];
    const visit = (unitId: string) => {
      result.push(unitId);
      for (const child of childrenByParent.get(unitId) ?? []) {
        visit(child.id);
      }
    };

    visit(id);
    return result;
  }

  private async detachUnitReferences(
    manager: EntityManager,
    unitIds: string[],
  ): Promise<void> {
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE users SET is_active = false, unit_id = NULL WHERE unit_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      unitIds,
      "UPDATE operator_shifts SET status = 'completed', ended_at = COALESCE(ended_at, NOW()), unit_id = NULL WHERE unit_id = ANY($1::uuid[])",
    );
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE event_logs SET unit_id = NULL WHERE unit_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE fire_missions SET author_unit_id = NULL WHERE author_unit_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE fire_missions SET executing_unit_id = NULL WHERE executing_unit_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE service_orders SET assigned_unit_id = NULL, assigned_scope = NULL WHERE assigned_unit_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE fire_positions SET unit_id = NULL WHERE unit_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      unitIds,
      'UPDATE weapon_systems SET unit_id = NULL WHERE unit_id = ANY($1::uuid[])',
    );
  }

  private async archiveRelatedDepots(
    manager: EntityManager,
    depotIds: string[],
  ): Promise<void> {
    await this.queryIfAny(
      manager,
      depotIds,
      'UPDATE fire_positions SET ammo_depot_id = NULL WHERE ammo_depot_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      depotIds,
      'UPDATE depots SET parent_id = NULL WHERE parent_id = ANY($1::uuid[])',
    );
    await this.queryIfAny(
      manager,
      depotIds,
      'UPDATE depots SET is_archived = true, unit_id = NULL, parent_id = NULL WHERE id = ANY($1::uuid[])',
    );
  }

  private async queryIfAny(
    manager: EntityManager,
    ids: string[],
    sql: string,
  ): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await manager.query(sql, [ids]);
  }

  private async ensurePasForUnit(unit: Unit): Promise<void> {
    const depotType = this.getPasDepotType(unit.type);

    if (!depotType) {
      return;
    }

    const existing = await this.depotsRepository.findOne({
      where: {
        unitId: unit.id,
        depotType,
        isArchived: false,
      },
    });

    if (existing) {
      return;
    }

    const parentDepot = await this.findParentPasDepot(unit);
    const depot = this.depotsRepository.create({
      name: `${this.getPasPrefix(unit.type)} ${unit.name}`,
      depotType,
      unitId: unit.id,
      parentId: parentDepot?.id ?? null,
    });

    const saved = await this.depotsRepository.save(depot);
    this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], 'created', {
      entity: 'depot',
      id: saved.id,
      unitId: unit.id,
    });
  }

  private getPasDepotType(type: string): 'division_pas' | 'battery_pas' | null {
    if (type === UnitType.DIVISION) return 'division_pas';
    if (type === UnitType.BATTERY) return 'battery_pas';
    return null;
  }

  private getPasPrefix(type: string): string {
    if (type === UnitType.DIVISION) return 'ПАС дивізіону';
    if (type === UnitType.BATTERY) return 'ПАС батареї';
    return 'ПАС';
  }

  private async findParentPasDepot(unit: Unit): Promise<Depot | null> {
    if (!unit.parentId) {
      return null;
    }

    const parent = await this.unitsRepository.findOne({
      where: { id: unit.parentId },
    });
    const parentDepotType = parent ? this.getPasDepotType(parent.type) : null;

    if (!parentDepotType) {
      return null;
    }

    return this.depotsRepository.findOne({
      where: {
        unitId: unit.parentId,
        depotType: parentDepotType,
        isArchived: false,
      },
    });
  }

  private emitReferenceChanged(
    action: 'created' | 'updated' | 'deleted',
    id: string,
  ): void {
    this.realtimeEvents.emitMany(
      ['reference', 'users', 'analytics', 'events'],
      action,
      {
        entity: 'unit',
        id,
      },
    );
  }
}
