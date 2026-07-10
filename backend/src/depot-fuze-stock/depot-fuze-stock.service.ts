import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Depot } from '../depots/depot.entity';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateDepotFuzeStockDto } from './dto/create-depot-fuze-stock.dto';
import { DepotFuzeStock } from './depot-fuze-stock.entity';

@Injectable()
export class DepotFuzeStockService {
  constructor(
    @InjectRepository(DepotFuzeStock)
    private readonly repository: Repository<DepotFuzeStock>,
    @InjectRepository(Depot)
    private readonly depotsRepository: Repository<Depot>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<DepotFuzeStock[]> {
    return this.repository.find({
      relations: {
        depot: true,
        fuze: true,
      },
    });
  }

  async create(data: CreateDepotFuzeStockDto): Promise<DepotFuzeStock> {
    await this.ensureAmmoDepot(data.depotId);
    this.assertPositiveQuantity(data.quantity);

    const item = this.repository.create(data);
    const saved = await this.repository.save(item);
    this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], 'created', {
      entity: 'depot_fuze_stock',
      id: saved.id,
    });
    return saved;
  }

  private async ensureAmmoDepot(depotId: string): Promise<void> {
    const depot = await this.depotsRepository.findOne({ where: { id: depotId } });
    if (!depot) throw new NotFoundException('Склад не знайдено');
    if (!['main_pas', 'division_pas', 'battery_pas', 'fire_position_ammo'].includes(depot.depotType)) {
      throw new BadRequestException('БК можна обліковувати тільки на складах БК/ПАС');
    }
  }

  private assertPositiveQuantity(quantity: number): void {
    if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      throw new BadRequestException('Кількість має бути більше 0');
    }
  }
}
