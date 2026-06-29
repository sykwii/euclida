import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.types';
import { EventLogsService } from '../event-logs/event-logs.service';
import { OperatorShift } from './operator-shift.entity';

@Injectable()
export class OperatorShiftsService {
  constructor(
    @InjectRepository(OperatorShift)
    private readonly repository: Repository<OperatorShift>,
    private readonly eventLogs: EventLogsService,
  ) {}

  findCurrent(user: AuthUser): Promise<OperatorShift | null> {
    return this.repository.findOne({
      where: {
        operatorUserId: user.sub,
        status: 'active',
        endedAt: IsNull(),
      },
      order: { startedAt: 'DESC' },
    });
  }

  async start(user: AuthUser): Promise<OperatorShift> {
    const current = await this.findCurrent(user);

    if (current) {
      throw new BadRequestException('Активная зміна уже начата');
    }

    const shift = await this.repository.save(
      this.repository.create({
        operatorUserId: user.sub,
        operatorLogin: user.login,
        operatorName: user.fullName,
        unitId: user.unitId,
        startedAt: new Date(),
        endedAt: null,
        status: 'active',
        note: null,
      }),
    );

    await this.eventLogs.create({
      eventType: 'operator_shift',
      action: 'started',
      actor: user,
      entityType: 'operator_shift',
      entityId: shift.id,
      entityName: shift.operatorName || shift.operatorLogin,
      title: 'Оператор начал смену',
      details: `${shift.operatorName || shift.operatorLogin} начал рабочую смену`,
      metadata: { shiftId: shift.id, startedAt: shift.startedAt.toISOString() },
    });

    return shift;
  }

  async end(user: AuthUser, note?: string): Promise<OperatorShift> {
    const current = await this.findCurrent(user);

    if (!current) {
      throw new BadRequestException('Нет активной смены для завершения');
    }

    current.endedAt = new Date();
    current.status = 'completed';
    current.note = note?.trim() || null;

    const saved = await this.repository.save(current);

    await this.eventLogs.create({
      eventType: 'operator_shift',
      action: 'completed',
      actor: user,
      entityType: 'operator_shift',
      entityId: saved.id,
      entityName: saved.operatorName || saved.operatorLogin,
      title: 'Оператор завершил смену',
      details: `${saved.operatorName || saved.operatorLogin} завершил рабочую смену`,
      metadata: {
        shiftId: saved.id,
        startedAt: saved.startedAt.toISOString(),
        endedAt: saved.endedAt?.toISOString(),
        note: saved.note,
      },
    });

    return saved;
  }
}
