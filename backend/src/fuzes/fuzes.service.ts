import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { CreateFuzeDto } from './dto/create-fuze.dto';
import { UpdateFuzeDto } from './dto/update-fuze.dto';
import { Fuze } from './fuze.entity';

@Injectable()
export class FuzesService {
  constructor(
    @InjectRepository(Fuze)
    private readonly fuzesRepository: Repository<Fuze>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findAll(): Promise<Fuze[]> {
    return this.fuzesRepository.find({
      order: { marking: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Fuze> {
    const fuze = await this.fuzesRepository.findOne({ where: { id } });

    if (!fuze) {
      throw new NotFoundException('Запалювач не знайдено');
    }

    return fuze;
  }

  create(data: CreateFuzeDto): Promise<Fuze> {
    const fuze = this.fuzesRepository.create(data);
    return this.fuzesRepository.save(fuze).then((saved) => {
      this.emitReferenceChanged('created', saved.id);
      return saved;
    });
  }

  async update(id: string, data: UpdateFuzeDto): Promise<Fuze> {
    const fuze = await this.findOne(id);
    Object.assign(fuze, data);
    const saved = await this.fuzesRepository.save(fuze);
    this.emitReferenceChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const fuze = await this.findOne(id);
    await this.fuzesRepository.remove(fuze);
    this.emitReferenceChanged('deleted', id);
  }

  private emitReferenceChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['reference', 'analytics', 'events'], action, {
      entity: 'fuze',
      id,
    });
  }
}