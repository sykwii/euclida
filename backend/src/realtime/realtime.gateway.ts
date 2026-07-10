import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
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

type AuthenticatedRealtimeSocket = Socket & {
  data: Socket['data'] & {
    user?: AuthUser;
  };
};

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
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly accessScope: AccessScopeService,
  ) {}

  async handleConnection(client: AuthenticatedRealtimeSocket): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      client.data.user = await this.jwtService.verifyAsync<AuthUser>(token);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: AuthenticatedRealtimeSocket): void {}

  broadcastRealtimeEvent(payload: RealtimeEventPayload): void {
    logRealtimeEvent(payload);
    void this.broadcastAuthorizedRealtimeEvent(payload);
  }

  private async broadcastAuthorizedRealtimeEvent(
    payload: RealtimeEventPayload,
  ): Promise<void> {
    const sockets = Array.from(
      (this.server?.sockets.sockets.values() || []) as Iterable<AuthenticatedRealtimeSocket>,
    );

    if (!sockets?.length) {
      return;
    }

    await Promise.all(
      sockets.map(async (client) => {
        const user = client.data.user;

        if (!user) {
          return;
        }

        if (!(await this.canReceiveRealtimeEvent(user, payload))) {
          return;
        }

        client.emit('realtime:event', payload);
      }),
    );
  }

  private extractToken(client: AuthenticatedRealtimeSocket): string | null {
    const handshakeAuthToken = client.handshake.auth?.['token'];

    if (typeof handshakeAuthToken === 'string' && handshakeAuthToken.trim()) {
      return handshakeAuthToken.trim();
    }

    const authorizationHeader = client.handshake.headers.authorization;

    if (typeof authorizationHeader === 'string') {
      const [type, token] = authorizationHeader.split(' ');

      if (type === 'Bearer' && token) {
        return token;
      }
    }

    const queryToken = client.handshake.query['token'];

    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    return null;
  }

  private async canReceiveRealtimeEvent(
    user: AuthUser,
    payload: RealtimeEventPayload,
  ): Promise<boolean> {
    if (this.isMainScopeOnlyPayload(payload)) {
      return user.role === 'admin' || user.scope === 'main';
    }

    if (payload.unitId) {
      return this.accessScope.canAccessUnit(user, payload.unitId);
    }

    return true;
  }

  private isMainScopeOnlyPayload(payload: RealtimeEventPayload): boolean {
    const mainOnlyScopes = new Set(['users', 'settings', 'reference', 'recon']);
    const mainOnlyEntities = new Set([
      'user',
      'settings',
      'unit',
      'charge',
      'fuze',
      'primer',
      'shell',
      'weapon_model',
      'zone',
      'shell_compatible_charge',
      'shell_compatible_fuze',
      'recon_setting',
      'recon_area',
      'recon_intelligence_report',
      'recon_observation',
      'recon_impact_observation',
      'recon_target',
      'recon_assessment',
      'recon_correlation',
      'recon_puar_proposal',
      'recon_processed_target_decision',
      'drone_logistics',
      'depot_shell_stock',
      'depot_charge_stock',
      'depot_fuze_stock',
      'depot_primer_stock',
      'fire_position_weapon',
    ]);

    return (
      mainOnlyScopes.has(payload.scope) ||
      (!!payload.entity && mainOnlyEntities.has(payload.entity))
    );
  }
}
