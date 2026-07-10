import { Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { RealtimeEventPayload } from './realtime.types';

const realtimeLogger = new Logger('RealtimeGateway');

function shouldLogRealtime(): boolean {
  return process.env.REALTIME_DEBUG === '1' || process.env.REALTIME_DEBUG === 'true';
}

function logRealtimeEvent(payload: RealtimeEventPayload): void {
  if (!shouldLogRealtime()) {
    return;
  }

  realtimeLogger.debug(
    `realtime:event ${payload.scope} ${payload.entity || '-'} ${payload.id || '-'} ${payload.reason || '-'}`,
  );
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
    logRealtimeEvent(payload);
    this.server?.emit('realtime:event', payload);
  }
}
