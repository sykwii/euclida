import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { RealtimeEventPayload } from './realtime.types';



type RealtimeEventName =
  | 'threat_changed'
  | 'service_order_changed'
  | 'fire_mission_changed'
  | 'map_changed'
  | 'stock_changed'
  | 'event_created'
  | 'analytics_changed'
  | 'reference_changed'
  | 'user_changed'
  | 'settings_changed'
  | 'all_changed';

interface RealtimePayload {
  scope: string;
  action?: string;
  entity?: string;
  id?: string;
  at: string;
  [key: string]: unknown;
}

const realtimeLogger = new Logger('RealtimeGateway');


function shouldLogRealtime(): boolean {
  return process.env.REALTIME_DEBUG === '1' || process.env.REALTIME_DEBUG === 'true';
}

function logRealtimeEvent(eventName: string, payload: Partial<RealtimePayload> | RealtimeEventPayload): void {
  if (!shouldLogRealtime()) {
    return;
  }

  realtimeLogger.debug(`${eventName} ${payload.scope} ${payload.entity || '-'} ${payload.id || '-'} ${payload.reason || '-'}`);
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);

    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = (
        process.env.CORS_ORIGINS ||
        'http://localhost:4200,http://localhost:8844,http://127.0.0.1:8844,http://194.146.231.21:8844'
      )
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed'), false);
    },
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;


broadcastRealtimeEvent(payload: RealtimeEventPayload): void {
  logRealtimeEvent('realtime:event', payload);
  this.server?.emit('realtime:event', payload);
}

  emitThreatChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('threat_changed', { scope: 'threats', entity: 'air_threat', ...payload });
    this.emitMapChanged({ reason: 'threat_changed' });
    this.emitAnalyticsChanged({ reason: 'threat_changed' });
  }

  emitServiceOrderChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('service_order_changed', { scope: 'missions', entity: 'service_order', ...payload });
    this.emitAnalyticsChanged({ reason: 'service_order_changed' });
  }

  emitFireMissionChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('fire_mission_changed', { scope: 'missions', entity: 'fire_mission', ...payload });
    this.emitMapChanged({ reason: 'fire_mission_changed' });
    this.emitAnalyticsChanged({ reason: 'fire_mission_changed' });
  }

  emitMapChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('map_changed', { scope: 'map', ...payload });
  }

  emitEventCreated(payload: Partial<RealtimePayload> = {}): void {
    this.emit('event_created', { scope: 'events', entity: 'event_log', ...payload });
  }

  emitStockChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('stock_changed', { scope: 'stock', ...payload });
    this.emitAnalyticsChanged({ reason: 'stock_changed' });
  }

  emitAnalyticsChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('analytics_changed', { scope: 'analytics', ...payload });
  }

  emitReferenceChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('reference_changed', { scope: 'reference', ...payload });
    this.emitAnalyticsChanged({ reason: 'reference_changed' });
  }

  emitUserChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('user_changed', { scope: 'users', entity: 'user', ...payload });
  }

  emitSettingsChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('settings_changed', { scope: 'settings', entity: 'settings', ...payload });
  }

  emitAllChanged(payload: Partial<RealtimePayload> = {}): void {
    this.emit('all_changed', { scope: 'all', ...payload });
  }

  private emit(eventName: RealtimeEventName, payload: Partial<RealtimePayload>): void {
    const fullPayload: RealtimePayload = {
      scope: payload.scope || 'all',
      at: new Date().toISOString(),
      ...payload,
    };

    logRealtimeEvent(eventName, fullPayload);
    this.server?.emit(eventName, fullPayload);
    this.broadcastRealtimeEvent({
      scope: fullPayload.scope as RealtimeEventPayload['scope'],
      action: (fullPayload.action as RealtimeEventPayload['action']) || 'changed',
      entity: fullPayload.entity,
      id: fullPayload.id,
      unitId: fullPayload.unitId as string | undefined,
      reason: (fullPayload.reason as string | undefined) || eventName,
      at: fullPayload.at,
    });
  }


  
}
