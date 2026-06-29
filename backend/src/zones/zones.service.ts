import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { Zone } from './zone.entity';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(Zone)
    private readonly repository: Repository<Zone>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Zone[]> {
    return this.repository.find({
  relations: {
    weaponModel: true,
  },
  order: {
    zoneNumber: 'ASC',
  },
});
  }

  async findOne(id: string): Promise<Zone> {
    const item = await this.repository.findOne({
  where: { id },
  relations: {
    weaponModel: true,
  },
});

    if (!item) {
      throw new NotFoundException('Зону не знайдено');
    }

    return item;
  }

  create(data: CreateZoneDto): Promise<Zone> {
    this.validateRange(data.distanceFromM, data.distanceToM);

    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(id: string, data: UpdateZoneDto): Promise<Zone> {
    const item = await this.findOne(id);

    const distanceFromM = data.distanceFromM ?? item.distanceFromM;
    const distanceToM = data.distanceToM ?? item.distanceToM;

    this.validateRange(distanceFromM, distanceToM);

    Object.assign(item, data);
    const saved = await this.repository.save(item);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.repository.remove(item);
    this.emitReferenceChanged('deleted', id);
  }

  private emitReferenceChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'analytics', 'events'], action, {
      entity: 'zone',
      id,
    });
  }

  private validateRange(distanceFromM: number, distanceToM: number): void {
    if (distanceFromM > distanceToM) {
      throw new BadRequestException('Відстань "від" не може бути більшою за відстань "до"');
    }
  }
  findByWeaponModel(weaponModelId: string): Promise<Zone[]> {
  return this.repository.find({
    where: {
      weaponModelId,
    },
    relations: {
      weaponModel: true,
    },
    order: {
      zoneNumber: 'ASC',
    },
  });
}
}