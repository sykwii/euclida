import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateDepotShellStockDto } from './dto/create-depot-shell-stock.dto';
import { DepotShellStock } from './depot-shell-stock.entity';

@Injectable()
export class DepotShellStockService {
  constructor(
    @InjectRepository(DepotShellStock)
    private readonly repository: Repository<DepotShellStock>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<DepotShellStock[]> {
    return this.repository.find({
      relations: {
        depot: true,
        shell: true,
      },
    });
  }

  create(data: CreateDepotShellStockDto): Promise<DepotShellStock> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.realtimeEvents.emitMany(['stock', 'analytics', 'events'], 'created', {
        entity: 'depot_shell_stock',
        id: saved.id,
      });
      return saved;
    });
  }
}
