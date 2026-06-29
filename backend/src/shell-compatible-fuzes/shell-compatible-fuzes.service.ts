import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateShellCompatibleFuzeDto } from './dto/create-shell-compatible-fuze.dto';
import { UpdateShellCompatibleFuzeDto } from './dto/update-shell-compatible-fuze.dto';
import { ShellCompatibleFuze } from './shell-compatible-fuze.entity';

@Injectable()
export class ShellCompatibleFuzesService {
  constructor(
    @InjectRepository(ShellCompatibleFuze)
    private readonly repository: Repository<ShellCompatibleFuze>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<ShellCompatibleFuze[]> {
    return this.repository.find({
      relations: {
        shell: true,
        fuze: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<ShellCompatibleFuze> {
    const item = await this.repository.findOne({
      where: { id },
      relations: {
        shell: true,
        fuze: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Сумісність снаряда і запалювача не знайдено');
    }

    return item;
  }

  create(data: CreateShellCompatibleFuzeDto): Promise<ShellCompatibleFuze> {
    const item = this.repository.create(data);
    return this.repository.save(item).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(
    id: string,
    data: UpdateShellCompatibleFuzeDto,
  ): Promise<ShellCompatibleFuze> {
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
      entity: 'shell_compatible_fuze',
      id,
    });
  }
}