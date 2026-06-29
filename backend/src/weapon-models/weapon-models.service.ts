import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateWeaponModelDto } from './dto/create-weapon-model.dto';
import { UpdateWeaponModelDto } from './dto/update-weapon-model.dto';
import { WeaponModel } from './weapon-model.entity';

@Injectable()
export class WeaponModelsService {
  constructor(
    @InjectRepository(WeaponModel)
    private readonly weaponModelsRepository: Repository<WeaponModel>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<WeaponModel[]> {
    return this.weaponModelsRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<WeaponModel> {
    const item = await this.weaponModelsRepository.findOne({ where: { id } });

    if (!item) {
      throw new NotFoundException('Зразок озброєння не знайдено');
    }

    return item;
  }

  create(data: CreateWeaponModelDto): Promise<WeaponModel> {
    const weaponModel = this.weaponModelsRepository.create(data);
    return this.weaponModelsRepository.save(weaponModel).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(id: string, data: UpdateWeaponModelDto): Promise<WeaponModel> {
    const item = await this.findOne(id);
    Object.assign(item, data);
    const saved = await this.weaponModelsRepository.save(item);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const item = await this.findOne(id);
    await this.weaponModelsRepository.remove(item);
    this.emitReferenceChanged('deleted', id);
  }

  private emitReferenceChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'analytics', 'events'], action, {
      entity: 'weapon_model',
      id,
    });
  }
}