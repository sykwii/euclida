import { Injectable } from '@nestjs/common';

@Injectable()
export class FreshnessEngine {
  calculate(lastSeenAt?: Date | string | null): number {
    if (!lastSeenAt) return 0;
    const ageHours = (Date.now() - new Date(lastSeenAt).getTime()) / 36e5;
    return Math.max(0, Math.min(100, Math.round(100 - ageHours * 4)));
  }
}
