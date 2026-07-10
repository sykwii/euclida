import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { Charge } from './charge.entity';
import { CreateChargeDto } from './dto/create-charge.dto';
import { UpdateChargeDto } from './dto/update-charge.dto';

@Injectable()
export class ChargesService {
  constructor(
    @InjectRepository(Charge)
    private readonly chargesRepository: Repository<Charge>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Charge[]> {
    return this.chargesRepository.find({
      order: { marking: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Charge> {
    const charge = await this.chargesRepository.findOne({ where: { id } });

    if (!charge) {
      throw new NotFoundException('Заряд не знайдено');
    }

    return charge;
  }

  create(data: CreateChargeDto): Promise<Charge> {
    const normalized = this.normalizeChargeData(data);
    const charge = this.chargesRepository.create(normalized);
    return this.chargesRepository.save(charge).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(id: string, data: UpdateChargeDto): Promise<Charge> {
    const charge = await this.findOne(id);
    const merged: CreateChargeDto = {
      marking: data.marking ?? charge.marking,
      packagingType: data.packagingType ?? charge.packagingType,
      measurementUnit: data.measurementUnit ?? charge.measurementUnit,
      chargeKind: data.chargeKind ?? charge.chargeKind,
      modulesPerCharge:
        data.modulesPerCharge ?? charge.modulesPerCharge ?? undefined,
      maxUsableModules:
        data.maxUsableModules ?? charge.maxUsableModules ?? undefined,
      moduleNote: data.moduleNote ?? charge.moduleNote ?? undefined,
    };

    Object.assign(charge, this.normalizeChargeData(merged));
    const saved = await this.chargesRepository.save(charge);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const charge = await this.findOne(id);
    await this.chargesRepository.remove(charge);
    this.emitReferenceChanged('deleted', id);
  }

  private emitReferenceChanged(
    action: 'created' | 'updated' | 'deleted',
    id: string,
  ): void {
    this.realtimeEvents.emitMany(
      ['reference', 'stock', 'analytics', 'events'],
      action,
      {
        entity: 'charge',
        id,
      },
    );
  }

  private normalizeChargeData(data: CreateChargeDto): Partial<Charge> {
    const chargeKind = data.chargeKind ?? 'unit';

    if (chargeKind === 'unit') {
      return {
        ...data,
        chargeKind,
        modulesPerCharge: null,
        maxUsableModules: null,
        moduleNote: data.moduleNote ?? null,
      };
    }

    const modulesPerCharge = Number(data.modulesPerCharge);
    const maxUsableModules = Number(data.maxUsableModules);

    if (!Number.isInteger(modulesPerCharge) || modulesPerCharge < 1) {
      throw new BadRequestException(
        'Для модульного заряду вкажи кількість модулів у заряді',
      );
    }

    if (!Number.isInteger(maxUsableModules) || maxUsableModules < 1) {
      throw new BadRequestException(
        'Для модульного заряду вкажи максимальну кількість модулів до використання',
      );
    }

    if (maxUsableModules > modulesPerCharge) {
      throw new BadRequestException(
        'Максимально дозволені модулі не можуть перевищувати кількість модулів у заряді',
      );
    }

    return {
      ...data,
      chargeKind,
      modulesPerCharge,
      maxUsableModules,
      moduleNote: data.moduleNote ?? null,
    };
  }
}
