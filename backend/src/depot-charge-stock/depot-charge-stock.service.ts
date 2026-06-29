import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateDepotChargeStockDto } from './dto/create-depot-charge-stock.dto';
import { DepotChargeStock } from './depot-charge-stock.entity';

@Injectable()
export class DepotChargeStockService {
  constructor(
    @InjectRepository(DepotChargeStock)
    private readonly repository: Repository<DepotChargeStock>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<DepotChargeStock[]> {
    return this.repository.find({
      relations: {
        depot: true,
        charge: true,
      },
    });
  }

  create(data: CreateDepotChargeStockDto): Promise<DepotChargeStock> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], 'created', {
        entity: 'depot_charge_stock',
        id: saved.id,
      });
      return saved;
    });
  }
}
