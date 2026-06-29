import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateDepotFuzeStockDto } from './dto/create-depot-fuze-stock.dto';
import { DepotFuzeStock } from './depot-fuze-stock.entity';

@Injectable()
export class DepotFuzeStockService {
  constructor(
    @InjectRepository(DepotFuzeStock)
    private readonly repository: Repository<DepotFuzeStock>,
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

  create(data: CreateDepotFuzeStockDto): Promise<DepotFuzeStock> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], 'created', {
        entity: 'depot_fuze_stock',
        id: saved.id,
      });
      return saved;
    });
  }
}
