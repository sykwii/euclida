import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class MainScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Користувача не визначено');
    }

    if (user.role === 'admin' || user.scope === 'main') {
      return true;
    }

    throw new ForbiddenException('Доступ дозволено тільки головному оператору або адміністратору');
  }
}
