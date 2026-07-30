import { JwtService } from '@nestjs/jwt';
import { AccessScopeService } from '../access-scope/access-scope.service';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway authentication', () => {
  const activeUser = {
    id: 'user-id',
    login: 'operator',
    role: 'operator',
    scope: 'battery',
    unitId: 'unit-id',
    fullName: null,
    isActive: true,
  };

  function client(input: {
    authToken?: string;
    authorization?: string;
    queryToken?: string;
  }) {
    return {
      data: {},
      handshake: {
        auth: input.authToken ? { token: input.authToken } : {},
        headers: input.authorization
          ? { authorization: input.authorization }
          : {},
        query: input.queryToken ? { token: input.queryToken } : {},
      },
      disconnect: jest.fn(),
      emit: jest.fn(),
    };
  }

  function createGateway(verifyAsync = jest.fn().mockResolvedValue({
    sub: activeUser.id,
    exp: Math.floor(Date.now() / 1_000) + 60,
  })) {
    const usersRepository = {
      findOne: jest.fn().mockResolvedValue(activeUser),
    };
    return {
      gateway: new RealtimeGateway(
        { verifyAsync } as unknown as JwtService,
        {} as AccessScopeService,
        usersRepository as never,
      ),
      verifyAsync,
      usersRepository,
    };
  }

  it('rejects query-string tokens and malformed or expired JWTs', async () => {
    const invalid = createGateway(jest.fn().mockRejectedValue(new Error('expired')));
    const queryClient = client({ queryToken: 'unsafe' });
    const expiredClient = client({ authToken: 'expired' });

    await invalid.gateway.handleConnection(queryClient as never);
    await invalid.gateway.handleConnection(expiredClient as never);

    expect(queryClient.disconnect).toHaveBeenCalledWith(true);
    expect(expiredClient.disconnect).toHaveBeenCalledWith(true);
  });

  it('rejects an anonymous socket in middleware before connection', async () => {
    const { gateway } = createGateway();
    let middleware;
    gateway.afterInit({
      use: (handler) => {
        middleware = handler;
      },
    } as never);
    const next = jest.fn();

    await middleware(client({}) as never, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('loads current active user state during an authenticated handshake', async () => {
    const { gateway, usersRepository } = createGateway();
    const socket = client({ authorization: 'Bearer valid' });

    await gateway.handleConnection(socket as never);

    expect(usersRepository.findOne).toHaveBeenCalledWith({
      where: { id: activeUser.id, isActive: true },
    });
    expect(socket.data).toMatchObject({
      user: {
        sub: activeUser.id,
        role: activeUser.role,
        scope: activeUser.scope,
        unitId: activeUser.unitId,
      },
    });
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
