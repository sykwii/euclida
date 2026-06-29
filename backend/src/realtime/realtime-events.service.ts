import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeAction, RealtimeEventPayload, RealtimeScope } from './realtime.types';

@Injectable()
export class RealtimeEventsService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emit(
    scope: RealtimeScope,
    action: RealtimeAction = 'changed',
    options: {
      entity?: string;
      id?: string;
      unitId?: string;
      reason?: string;
    } = {},
  ): void {
    const payload: RealtimeEventPayload = {
      scope,
      action,
      entity: options.entity,
      id: options.id,
      unitId: options.unitId,
      reason: options.reason,
      at: new Date().toISOString(),
    };

    this.gateway.broadcastRealtimeEvent(payload);
  }

  emitMany(
    scopes: RealtimeScope[],
    action: RealtimeAction = 'changed',
    options: {
      entity?: string;
      id?: string;
      unitId?: string;
      reason?: string;
    } = {},
  ): void {
    Array.from(new Set(scopes)).forEach((scope) =>
      this.emit(scope, action, {
        ...options,
        reason: options.reason || `${options.entity || 'entity'}_${action}`,
      }),
    );
  }
}