import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DataSource } from 'typeorm';
import { AuthUser } from './auth-user.types';
import { IS_PUBLIC_KEY } from './public.decorator';
import { User } from '../users/user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Потрібна авторизація');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Некоректний токен авторизації');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token);
      const user = await this.dataSource.getRepository(User).findOne({
        where: { id: payload.sub, isActive: true },
      });

      if (!user) {
        throw new UnauthorizedException();
      }

      request.user = {
        sub: user.id,
        login: user.login,
        role: user.role,
        scope: user.scope,
        unitId: user.unitId,
        fullName: user.fullName,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Сесія недійсна або завершена');
    }
  }
}
