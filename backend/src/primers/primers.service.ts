import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreatePrimerDto } from './dto/create-primer.dto';
import { UpdatePrimerDto } from './dto/update-primer.dto';
import { Primer } from './primer.entity';

@Injectable()
export class PrimersService {
  constructor(
    @InjectRepository(Primer)
    private readonly primersRepository: Repository<Primer>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Primer[]> {
    return this.primersRepository.find({
      order: { marking: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Primer> {
    const primer = await this.primersRepository.findOne({ where: { id } });

    if (!primer) {
      throw new NotFoundException('Капсуль не знайдено');
    }

    return primer;
  }

  create(data: CreatePrimerDto): Promise<Primer> {
    const primer = this.primersRepository.create(data);
    return this.primersRepository.save(primer).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(id: string, data: UpdatePrimerDto): Promise<Primer> {
    const primer = await this.findOne(id);
    Object.assign(primer, data);
    const saved = await this.primersRepository.save(primer);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const primer = await this.findOne(id);
    await this.primersRepository.remove(primer);
    this.emitReferenceChanged('deleted', id);
  }

  private emitReferenceChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'analytics', 'events'], action, {
      entity: 'primer',
      id,
    });
  }
}