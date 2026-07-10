import { Injectable } from '@nestjs/common';

@Injectable()
export class ThreatIndexEngine {
  calculate(targetType: string, confidence: number, activity: number, freshness: number): number {
    const typeWeight: Record<string, number> = {
      mortar: 0.75,
      tube_artillery: 0.9,
      mlrs: 1,
    };
    const base = confidence * 0.4 + activity * 0.25 + freshness * 0.25;
    return Math.min(100, Math.round(base * (typeWeight[targetType] || 0.75) + 10));
  }
}
