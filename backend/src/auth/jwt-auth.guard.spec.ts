import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const request = (authorization?: string) => ({
    headers: { authorization },
    user: undefined,
  });

  function contextFor(value: ReturnType<typeof request>): ExecutionContext {
    return {
      getHandler: () => ({}) as never,
      getClass: () => ({}) as never,
      switchToHttp: () => ({
        getRequest: () => value,
      }),
    } as ExecutionContext;
  }

  function guardWith(
    verifyAsync: jest.Mock,
    findOne: jest.Mock,
  ): JwtAuthGuard {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    return new JwtAuthGuard(
      { verifyAsync } as unknown as JwtService,
      reflector,
      {
        getRepository: () => ({ findOne }),
      } as unknown as DataSource,
    );
  }

  it('rejects missing, malformed, expired, or invalid tokens', async () => {
    const guard = guardWith(
      jest.fn().mockRejectedValue(new Error('invalid token')),
      jest.fn(),
    );

    await expect(
      guard.canActivate(contextFor(request())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      guard.canActivate(contextFor(request('Bearer invalid'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reloads current role and scope instead of trusting stale token claims', async () => {
    const current = {
      id: 'user-id',
      login: 'operator',
      role: 'observer',
      scope: 'battery',
      unitId: 'unit-b',
      fullName: null,
    };
    const req = request('Bearer valid');
    const guard = guardWith(
      jest.fn().mockResolvedValue({
        sub: 'user-id',
        role: 'admin',
        scope: 'main',
      }),
      jest.fn().mockResolvedValue(current),
    );

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({
      sub: current.id,
      login: current.login,
      role: current.role,
      scope: current.scope,
      unitId: current.unitId,
      fullName: current.fullName,
    });
  });

  it('rejects a user archived after token issuance', async () => {
    const guard = guardWith(
      jest.fn().mockResolvedValue({ sub: 'archived-user' }),
      jest.fn().mockResolvedValue(null),
    );

    await expect(
      guard.canActivate(contextFor(request('Bearer valid'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
