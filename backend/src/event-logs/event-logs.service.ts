import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { EventLog } from './event-log.entity';

export interface EventLogFilters {
  eventType?: string;
  action?: string;
  entityType?: string;
  q?: string;
  limit?: number;
}

export interface CreateEventLogInput {
  eventType: string;
  action: string;

  actor: AuthUser;

  unitId?: string | null;
  unitName?: string | null;

  entityType?: string | null;
  entityId?: string | null;
  entityName?: string | null;

  title: string;
  details?: string | null;

  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class EventLogsService implements OnModuleInit {
  private readonly logger = new Logger(EventLogsService.name);

  constructor(
    @InjectRepository(EventLog)
    private readonly repository: Repository<EventLog>,
    private readonly accessScope: AccessScopeService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.dataSource.query(
        'ALTER TABLE event_logs ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ NULL',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to ensure event_logs.read_at column: ${message}`,
      );
    }
  }

  async findAll(
    user: AuthUser,
    filters: EventLogFilters = {},
  ): Promise<EventLog[]> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);

    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return [];
    }

    const limit = Math.min(Math.max(Number(filters.limit || 200), 1), 500);
    const query = this.repository
      .createQueryBuilder('event')
      .orderBy('event.createdAt', 'DESC')
      .take(limit);

    if (allowedUnitIds !== null) {
      query.andWhere('event.unitId IN (:...allowedUnitIds)', {
        allowedUnitIds,
      });
    }

    if (filters.eventType) {
      query.andWhere('event.eventType = :eventType', {
        eventType: filters.eventType,
      });
    }

    if (filters.action) {
      query.andWhere('event.action = :action', { action: filters.action });
    }

    if (filters.entityType) {
      query.andWhere('event.entityType = :entityType', {
        entityType: filters.entityType,
      });
    }

    const search = filters.q?.trim();

    if (search) {
      query.andWhere(
        new Brackets((qb) => {
          qb.where('event.title ILIKE :search', { search: `%${search}%` })
            .orWhere('event.details ILIKE :search', { search: `%${search}%` })
            .orWhere('event.entityName ILIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('event.unitName ILIKE :search', { search: `%${search}%` })
            .orWhere('event.actorName ILIKE :search', { search: `%${search}%` })
            .orWhere('event.actorLogin ILIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    return query.getMany();
  }

  async create(data: CreateEventLogInput): Promise<EventLog> {
    const event = this.repository.create({
      eventType: data.eventType,
      action: data.action,

      actorUserId: data.actor.sub,
      actorLogin: data.actor.login,
      actorName: data.actor.fullName,
      actorRole: data.actor.role,
      actorScope: data.actor.scope,

      unitId: data.unitId ?? data.actor.unitId ?? null,
      unitName: data.unitName ?? null,

      entityType: data.entityType ?? null,
      entityId: data.entityId ?? null,
      entityName: data.entityName ?? null,

      title: data.title,
      details: data.details ?? null,
      metadata: data.metadata ?? null,
    });

    return this.repository.save(event);
  }

  async markRead(user: AuthUser, ids?: string[]): Promise<{ updated: number }> {
    const allowedUnitIds = await this.accessScope.getAllowedUnitIds(user);
    const query = this.repository
      .createQueryBuilder()
      .update(EventLog)
      .set({ readAt: () => 'NOW()' })
      .where('read_at IS NULL');

    if (allowedUnitIds !== null) {
      if (allowedUnitIds.length === 0) {
        return { updated: 0 };
      }

      query.andWhere('unit_id IN (:...allowedUnitIds)', { allowedUnitIds });
    }

    if (ids?.length) {
      query.andWhere('id IN (:...ids)', { ids });
    }

    const result = await query.execute();
    return { updated: result.affected ?? 0 };
  }
}
