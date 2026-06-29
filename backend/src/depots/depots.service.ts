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
import { Depot } from './depot.entity';
import { CreateDepotDto } from './dto/create-depot.dto';
import { UpdateDepotDto } from './dto/update-depot.dto';

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
      throw new NotFoundException('Склад не найден');
    }

    if (user) {
      await this.ensureCanUseDepot(user, depot);
    }

    return depot;
  }

  async create(data: CreateDepotDto, user: AuthUser): Promise<Depot> {
    await this.ensureCanManageUnit(user, data.unitId ?? null);

    const depot = this.repository.create(data);
    const saved = await this.repository.save(depot);
    this.emitDepotChanged('created', saved.id);
    return saved;
  }

  async update(id: string, data: UpdateDepotDto, user: AuthUser): Promise<Depot> {
    const depot = await this.findOne(id, user);

    if (data.unitId !== undefined) {
      await this.ensureCanManageUnit(user, data.unitId ?? null);
    }

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
}
