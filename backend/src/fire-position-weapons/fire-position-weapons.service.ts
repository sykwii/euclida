import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateFirePositionWeaponDto } from './dto/create-fire-position-weapon.dto';
import { FirePositionWeapon } from './fire-position-weapon.entity';
import { NotFoundException } from '@nestjs/common';

@Injectable()
export class FirePositionWeaponsService {
  constructor(
    @InjectRepository(FirePositionWeapon)
    private readonly repository: Repository<FirePositionWeapon>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<FirePositionWeapon[]> {
    return this.repository.find({
      relations: {
        firePosition: true,
        weaponSystem: {
          weaponModel: true,
          unit: true,
        },
      },
      order: {
        assignedAt: 'DESC',
      },
    });
  }

  create(data: CreateFirePositionWeaponDto): Promise<FirePositionWeapon> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.emitBindingChanged('created', saved.id);
      return saved;
    });
  }
  async findOne(id: string): Promise<FirePositionWeapon> {
  const item = await this.repository.findOne({
    where: { id },
    relations: {
      firePosition: true,
      weaponSystem: {
        weaponModel: true,
        unit: true,
      },
    },
  });

  if (!item) {
    throw new NotFoundException('Прив’язку засобу до ВП не знайдено');
  }

  return item;
}

async remove(id: string): Promise<void> {
  const item = await this.findOne(id);
  await this.repository.remove(item);
  this.emitBindingChanged('deleted', id);
}

private emitBindingChanged(action: 'created' | 'deleted', id: string): void {
  this.realtimeEvents.emitMany(['weapons', 'map', 'analytics', 'events'], action, {
    entity: 'fire_position_weapon',
    id,
  });
}
}