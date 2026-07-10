import { Injectable } from '@nestjs/common';

@Injectable()
export class ActivityIndexEngine {
  calculate(count24h: number, totalCount: number): number {
    return Math.min(100, Math.round(count24h * 22 + totalCount * 8));
  }
}
