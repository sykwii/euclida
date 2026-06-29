import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RealtimeEventsService } from '../realtime/realtime-events.service';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  findByLogin(login: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        login,
        isActive: true,
      },
    });
  }

  findAll(): Promise<User[]> {
    return this.repository.find({
      relations: {
        unit: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async create(data: CreateUserDto): Promise<User> {
    const existing = await this.repository.findOne({
      where: {
        login: data.login.trim(),
      },
    });

    if (existing) {
      throw new BadRequestException('Користувач з таким логіном вже існує');
    }

    if (data.scope !== 'main' && !data.unitId) {
      throw new BadRequestException('Для рівня дивізіон/батарея потрібно обрати підрозділ');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = this.repository.create({
      login: data.login.trim(),
      passwordHash,
      fullName: data.fullName?.trim() || null,
      role: data.role,
      scope: data.scope,
      unitId: data.scope === 'main' ? null : data.unitId || null,
      isActive: data.isActive ?? true,
    });

    const saved = await this.repository.save(user);
    this.emitUserChanged('created', saved.id);
    return saved;
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.repository.findOne({
      where: {
        id,
      },
    });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    if (data.login !== undefined) {
      const login = data.login.trim();

      const existing = await this.repository.findOne({
        where: {
          login,
        },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException('Користувач з таким логіном вже існує');
      }

      user.login = login;
    }

    if (data.password) {
      user.passwordHash = await bcrypt.hash(data.password, 10);
    }

    if (data.fullName !== undefined) {
      user.fullName = data.fullName?.trim() || null;
    }

    if (data.role !== undefined) {
      user.role = data.role;
    }

    if (data.scope !== undefined) {
      user.scope = data.scope;
    }

    if (data.unitId !== undefined) {
      user.unitId = data.unitId;
    }

    if (user.scope === 'main') {
      user.unitId = null;
    }

    if (user.scope !== 'main' && !user.unitId) {
      throw new BadRequestException('Для рівня дивізіон/батарея потрібно обрати підрозділ');
    }

    if (data.isActive !== undefined) {
      user.isActive = data.isActive;
    }

    const saved = await this.repository.save(user);
    this.emitUserChanged('updated', saved.id);
    return saved;
  }

  async remove(id: string): Promise<void> {
    const user = await this.repository.findOne({
      where: {
        id,
      },
    });

    if (!user) {
      throw new NotFoundException('Користувача не знайдено');
    }

    await this.repository.remove(user);
    this.emitUserChanged('deleted', id);
  }

  private emitUserChanged(action: 'created' | 'updated' | 'deleted', id: string): void {
    this.realtimeEvents.emitMany(['users', 'events'], action, {
      entity: 'user',
      id,
    });
  }
}