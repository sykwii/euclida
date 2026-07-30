import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const MAX_TRACKED_KEYS = 10_000;

interface AttemptWindow {
  count: number;
  expiresAt: number;
}

@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, AttemptWindow>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const login =
      typeof request.body?.login === 'string'
        ? request.body.login.trim().toLowerCase().slice(0, 128)
        : '-';
    const key = `${request.ip || request.socket.remoteAddress || '-'}:${login}`;
    const now = Date.now();
    const existing = this.attempts.get(key);

    if (!existing || existing.expiresAt <= now) {
      this.prune(now);
      this.attempts.set(key, { count: 1, expiresAt: now + WINDOW_MS });
      return true;
    }

    if (existing.count >= MAX_ATTEMPTS) {
      throw new HttpException(
        'Забагато спроб входу. Спробуйте пізніше',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
    return true;
  }

  private prune(now: number): void {
    for (const [key, value] of this.attempts) {
      if (value.expiresAt <= now || this.attempts.size >= MAX_TRACKED_KEYS) {
        this.attempts.delete(key);
      }
    }
  }
}
