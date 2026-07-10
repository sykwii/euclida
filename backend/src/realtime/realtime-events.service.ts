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
      at?: string;
    } = {},
  ): void {
    const payload: RealtimeEventPayload = {
      version: 1,
      scope,
      action,
      entity: options.entity,
      id: options.id,
      unitId: options.unitId,
      reason: options.reason,
      at: options.at || new Date().toISOString(),
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
    const normalizedScopes = Array.from(
      new Set<RealtimeScope>([...scopes.filter(Boolean), 'all']),
    );
    const at = new Date().toISOString();
    const reason = options.reason || `${options.entity || 'entity'}_${action}`;

    normalizedScopes.forEach((scope) =>
      this.emit(scope, action, {
        ...options,
        reason,
        at,
      }),
    );
  }
}
