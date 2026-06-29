import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateShellDto } from './dto/create-shell.dto';
import { UpdateShellDto } from './dto/update-shell.dto';
import { Shell } from './shell.entity';

@Injectable()
export class ShellsService {
  constructor(
    @InjectRepository(Shell)
    private readonly shellsRepository: Repository<Shell>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Shell[]> {
    return this.shellsRepository.find({
      order: { marking: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Shell> {
    const shell = await this.shellsRepository.findOne({ where: { id } });

    if (!shell) {
      throw new NotFoundException('Снаряд не знайдено');
    }

    return shell;
  }

  create(data: CreateShellDto): Promise<Shell> {
    const shell = this.shellsRepository.create(data);
    return this.shellsRepository.save(shell).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(id: string, data: UpdateShellDto): Promise<Shell> {
    const shell = await this.findOne(id);
    Object.assign(shell, data);
    const saved = await this.shellsRepository.save(shell);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const shell = await this.findOne(id);
    await this.shellsRepository.remove(shell);
    this.emitReferenceChanged('deleted', id);
  }

  private emitReferenceChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'analytics', 'events'], action, {
      entity: 'shell',
      id,
    });
  }
}