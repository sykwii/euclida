import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class HttpWriteGuard implements CanActivate {
  private readonly readMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (this.readMethods.has(request.method)) {
      return true;
    }

    const user = request.user;

    if (user?.role === 'admin' || user?.role === 'operator') {
      return true;
    }

    throw new ForbiddenException('Недостатньо прав для зміни даних');
  }
}
