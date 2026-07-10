import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { StockMovement } from '../stock-movements/stock-movement.entity';
import { Unit } from '../units/unit.entity';
import { Depot } from './depot.entity';
import { CreateDepotDto } from './dto/create-depot.dto';
import { UpdateDepotDto } from './dto/update-depot.dto';

type NormalizedUnitType = 'main' | 'division' | 'battery' | 'platoon' | 'squad';
type DepotUnitType = Exclude<NormalizedUnitType, 'main'>;

@Injectable()
export class DepotsService {
  constructor(
    @InjectRepository(Depot)
    private readonly repository: Repository<Depot>,

    @InjectDataSource()
    private readonly dataSource: DataSource,

    private readonly accessScope: AccessScopeService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async findAll(user: AuthUser): Promise<Depot[]> {
    const allowedUnitIds = await this.accessScope.getVisibleDepotUnitIds(user);
    const scopedWhere =
      allowedUnitIds === null
        ? {}
        : allowedUnitIds.length > 0
          ? { unitId: In(allowedUnitIds) }
          : { id: In([]) };

    return this.repository.find({
      where: {
        ...scopedWhere,
        isArchived: false,
      },
      relations: {
        unit: true,
        parent: true,
      },
      order: {
        name: 'ASC',
      },
    });
  }

  async findOne(id: string, user?: AuthUser): Promise<Depot> {
    const depot = await this.repository.findOne({
      where: { id },
      relations: {
        unit: true,
        parent: true,
      },
    });

    if (!depot) {
      throw new NotFoundException('Склад не знайдено');
    }

    if (user) {
      await this.ensureCanUseDepot(user, depot);
    }

    return depot;
  }

  async create(data: CreateDepotDto, user: AuthUser): Promise<Depot> {
    await this.ensureCanManageUnit(user, data.unitId ?? null);
    await this.ensureDepotUnitMatchesType(data.depotType, data.unitId ?? null);

    const depot = this.repository.create(data);
    const saved = await this.repository.save(depot);
    this.emitDepotChanged('created', saved.id);
    return saved;
  }

  async update(id: string, data: UpdateDepotDto, user: AuthUser): Promise<Depot> {
    const depot = await this.findOne(id, user);
    const nextDepotType = data.depotType ?? depot.depotType;
    const nextUnitId = data.unitId !== undefined ? data.unitId ?? null : depot.unitId;

    if (data.unitId !== undefined) {
      await this.ensureCanManageUnit(user, data.unitId ?? null);
    }
    await this.ensureDepotUnitMatchesType(nextDepotType, nextUnitId);

    Object.assign(depot, data);
    const saved = await this.repository.save(depot);
    this.emitDepotChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const item = await this.findOne(id, user);

    const movementsCount = await this.dataSource.getRepository(StockMovement).count({
      where: [{ fromDepotId: id }, { toDepotId: id }],
    });

    if (movementsCount > 0) {
      throw new BadRequestException(
        'Склад не можна видалити, тому що він використовується в історії переміщень. Архівуйте його.',
      );
    }

    item.isArchived = true;
    await this.repository.save(item);
    this.emitDepotChanged('deleted', id);
  }

  private emitDepotChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], action, {
      entity: 'depot',
      id,
    });
  }

  private async ensureCanUseDepot(user: AuthUser, depot: Depot): Promise<void> {
    await this.ensureCanSeeDepotUnit(user, depot.unitId);
  }

  private async ensureCanSeeDepotUnit(
    user: AuthUser,
    unitId: string | null | undefined,
  ): Promise<void> {
    if (user.role === 'admin' || user.scope === 'main') {
      return;
    }

    const visibleUnitIds = await this.accessScope.getVisibleDepotUnitIds(user);

    if (visibleUnitIds === null) {
      return;
    }

    if (!unitId || !visibleUnitIds.includes(unitId)) {
      throw new ForbiddenException('Недостатньо прав для цього складу');
    }
  }

  private async ensureCanManageUnit(
    user: AuthUser,
    unitId: string | null | undefined,
  ): Promise<void> {
    if (user.role === 'admin' || user.scope === 'main') {
      return;
    }

    if (!unitId || !(await this.accessScope.canAccessUnit(user, unitId))) {
      throw new ForbiddenException('Недостатньо прав для зміни складу цього підрозділу');
    }
  }

  private async ensureDepotUnitMatchesType(
    depotType: string | undefined,
    unitId: string | null,
  ): Promise<void> {
    const allowedTypes = this.getAllowedUnitTypesForDepot(depotType);
    if (!allowedTypes) {
      return;
    }

    if (!unitId) {
      throw new BadRequestException('Оберіть коректний підрозділ для складу');
    }

    const unit = await this.dataSource.getRepository(Unit).findOne({ where: { id: unitId } });
    if (!unit) {
      throw new BadRequestException('Оберіть коректний підрозділ для складу');
    }

    const normalizedType = this.normalizeUnitType(unit.type);
    if (!(allowedTypes as NormalizedUnitType[]).includes(normalizedType)) {
      throw new BadRequestException(this.getDepotUnitTypeError(depotType));
    }
  }

  private getAllowedUnitTypesForDepot(depotType: string | undefined): DepotUnitType[] | null {
    if (depotType === 'division_pas') return ['division'];
    if (depotType === 'battery_pas') return ['battery'];
    if (depotType === 'fire_position_ammo') return ['battery', 'platoon', 'squad'];
    if (depotType === 'drone_depot') return ['division', 'battery', 'platoon', 'squad'];
    return null;
  }

  private getDepotUnitTypeError(depotType: string | undefined): string {
    if (depotType === 'division_pas') return "Склад дивізіону можна прив'язати тільки до дивізіону";
    if (depotType === 'battery_pas') return "Склад батареї можна прив'язати тільки до батареї";
    return 'Оберіть коректний підрозділ для складу';
  }

  private normalizeUnitType(type: string | null | undefined): NormalizedUnitType {
    const value = (type || '').trim().toLowerCase();
    if (value === 'main' || value === 'command' || value === 'dnar') return 'main';
    if (value === 'division' || value === 'divizion') return 'division';
    if (value === 'battery') return 'battery';
    if (value === 'platoon') return 'platoon';
    if (value === 'squad') return 'squad';
    if (value.includes('див') || value.includes('дн')) return 'division';
    if (value.includes('бат')) return 'battery';
    if (value.includes('взвод')) return 'platoon';
    if (value.includes('відділ')) return 'squad';
    return 'battery';
  }
}
