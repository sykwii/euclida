import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Unit } from './unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { RealtimeEventsService } from '../realtime/realtime-events.service';

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitsRepository: Repository<Unit>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Unit[]> {
    return this.unitsRepository.find({
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
  this.emitReferenceChanged('created', saved.id);
  return saved;
}

async update(id: string, data: UpdateUnitDto): Promise<Unit> {
  const unit = await this.findOne(id);
  Object.assign(unit, data);
  const saved = await this.unitsRepository.save(unit);
  this.emitReferenceChanged('updated', saved.id);
  return saved;
}

  async remove(id: string): Promise<void> {
    const unit = await this.findOne(id);
    await this.unitsRepository.remove(unit);
  this.emitReferenceChanged('deleted', id);
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


  private emitReferenceChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'users', 'analytics', 'events'], action, {
      entity: 'unit',
      id,
    });
  }
 
}
