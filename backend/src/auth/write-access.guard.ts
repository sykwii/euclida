import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class WriteAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Користувач не визначений');
    }

    if (user.role === 'admin' || user.role === 'operator') {
      return true;
    }

    throw new ForbiddenException('Недостатньо прав для зміни даних');
  }
}