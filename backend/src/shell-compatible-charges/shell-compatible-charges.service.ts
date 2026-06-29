import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateShellCompatibleChargeDto } from './dto/create-shell-compatible-charge.dto';
import { ShellCompatibleCharge } from './shell-compatible-charge.entity';
import { NotFoundException } from '@nestjs/common';
import { UpdateShellCompatibleChargeDto } from './dto/update-shell-compatible-charge.dto';

@Injectable()
export class ShellCompatibleChargesService {
  constructor(
    @InjectRepository(ShellCompatibleCharge)
    private readonly repository: Repository<ShellCompatibleCharge>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<ShellCompatibleCharge[]> {
    return this.repository.find({
      relations: {
        shell: true,
        charge: true,
        zone: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  create(data: CreateShellCompatibleChargeDto): Promise<ShellCompatibleCharge> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }
  async findOne(id: string): Promise<ShellCompatibleCharge> {
  const item = await this.repository.findOne({
    where: { id },
    relations: {
      shell: true,
      charge: true,
    },
  });

  if (!item) {
    throw new NotFoundException('Сумісність снаряда і заряду не знайдено');
  }

  return item;
}

async update(
  id: string,
  data: UpdateShellCompatibleChargeDto,
): Promise<ShellCompatibleCharge> {
  const item = await this.findOne(id);
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
    entity: 'shell_compatible_charge',
    id,
  });
}
}