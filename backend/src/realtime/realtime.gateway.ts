import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AccessScopeService } from '../access-scope/access-scope.service';
import type { AuthUser } from '../auth/auth-user.types';
import { RealtimeEventPayload } from './realtime.types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import {
  configuredCorsOrigins,
  isAllowedOrigin,
} from '../common/security/cors-policy';

const realtimeLogger = new Logger('RealtimeGateway');

function shouldLogRealtime(): boolean {
  return (
    process.env.REALTIME_DEBUG === '1' || process.env.REALTIME_DEBUG === 'true'
  );
}

function logRealtimeEvent(payload: RealtimeEventPayload): void {
  if (!shouldLogRealtime()) {
    return;
  }

  realtimeLogger.debug(
    `realtime:event ${payload.scope} ${payload.entity || '-'} ${payload.id || '-'} ${payload.reason || '-'}`,
  );
}

type AuthenticatedRealtimeSocket = Socket & {
  data: Socket['data'] & {
    user?: AuthUser;
    tokenExpiresAt?: number;
  };
};

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = configuredCorsOrigins();

      if (isAllowedOrigin(origin, allowedOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed'), false);
    },
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly accessScope: AccessScopeService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  afterInit(server: Server): void {
    server.use(async (socket, next) => {
      try {
        await this.authenticateClient(socket as AuthenticatedRealtimeSocket);
        next();
      } catch {
        next(new Error('Unauthorized'));
      }
    });
  }

  async handleConnection(client: AuthenticatedRealtimeSocket): Promise<void> {
    if (client.data.user) {
      return;
    }

    try {
      await this.authenticateClient(client);
    } catch {
      client.disconnect(true);
    }
  }

  private async authenticateClient(
    client: AuthenticatedRealtimeSocket,
  ): Promise<void> {
    const token = this.extractToken(client);

    if (!token) {
      throw new Error('Unauthorized');
    }

    const payload = await this.jwtService.verifyAsync<AuthUser & { exp?: number }>(
        token,
      );
    client.data.user = await this.findActiveAuthUser(payload.sub);
    if (!client.data.user) {
      throw new Error('Unauthorized');
    }
    client.data.tokenExpiresAt = payload.exp ? payload.exp * 1_000 : undefined;
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
      (this.server?.sockets.sockets.values() ||
        []) as Iterable<AuthenticatedRealtimeSocket>,
    );

    if (!sockets?.length) {
      return;
    }

    await Promise.all(
      sockets.map(async (client) => {
        const tokenUser = client.data.user;

        if (!tokenUser) {
          return;
        }

        if (
          client.data.tokenExpiresAt &&
          client.data.tokenExpiresAt <= Date.now()
        ) {
          client.disconnect(true);
          return;
        }

        const user = await this.findActiveAuthUser(tokenUser.sub);
        if (!user) {
          client.disconnect(true);
          return;
        }
        client.data.user = user;

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

    return null;
  }

  private async findActiveAuthUser(id: string): Promise<AuthUser | null> {
    const user = await this.usersRepository.findOne({
      where: {
        id,
        isActive: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      sub: user.id,
      login: user.login,
      role: user.role,
      scope: user.scope,
      unitId: user.unitId,
      fullName: user.fullName,
    };
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
