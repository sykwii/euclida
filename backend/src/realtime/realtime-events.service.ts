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

  if (scope !== 'all') {
    this.gateway.broadcastRealtimeEvent({
      ...payload,
      scope: 'all',
      reason: payload.reason || `${payload.entity || 'entity'}_${action}`,
    });
  }
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
  const normalizedScopes = Array.from(new Set<RealtimeScope>(['all', ...scopes]));

  normalizedScopes.forEach((scope) =>
    this.emit(scope, action, {
      ...options,
      reason: options.reason || `${options.entity || 'entity'}_${action}`,
    }),
  );
}
}