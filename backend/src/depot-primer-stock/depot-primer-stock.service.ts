import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateDepotPrimerStockDto } from './dto/create-depot-primer-stock.dto';
import { DepotPrimerStock } from './depot-primer-stock.entity';

@Injectable()
export class DepotPrimerStockService {
  constructor(
    @InjectRepository(DepotPrimerStock)
    private readonly repository: Repository<DepotPrimerStock>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<DepotPrimerStock[]> {
    return this.repository.find({
      relations: {
        depot: true,
        primer: true,
      },
    });
  }

  create(data: CreateDepotPrimerStockDto): Promise<DepotPrimerStock> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], 'created', {
        entity: 'depot_primer_stock',
        id: saved.id,
      });
      return saved;
    });
  }
}