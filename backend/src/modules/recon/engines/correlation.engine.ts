import { Injectable } from '@nestjs/common';
import { ReconSettingsService } from '../services/recon-settings.service';

@Injectable()
export class CorrelationEngine {
  constructor(private readonly settings: ReconSettingsService) {}

  async score(input: {
    targetType: string;
    targetConfidence: number;
    impactSource: string;
    distanceM: number;
    timeDeltaSec: number;
    targetUpdatedAt?: Date | string | null;
  }): Promise<{ score: number; reasonJson: Record<string, unknown> }> {
    const allSettings = await this.settings.getAll();
    const correlation = allSettings['correlation'] as {
      maxDistanceM?: number;
      maxTimeDeltaHours?: number;
      maxRangeM?: Record<string, number>;
      weights?: Record<string, number>;
    };
    const sourceWeights = allSettings['sourceWeights'] as Record<string, number>;
    const weights = correlation.weights || {};
    const maxDistanceM = Number(correlation.maxDistanceM || 3000);
    const maxTimeDeltaSec = Number(correlation.maxTimeDeltaHours || 72) * 3600;
    const maxRangeM = Number(correlation.maxRangeM?.[input.targetType] || maxDistanceM);

    const distanceScore = this.clamp(1 - input.distanceM / maxDistanceM);
    const timeScore = this.clamp(1 - input.timeDeltaSec / maxTimeDeltaSec);
    const rangeScore = input.distanceM <= maxRangeM ? 1 : 0;
    const typeScore = input.targetType ? 1 : 0;
    const freshnessScore = this.freshness(input.targetUpdatedAt);
    const confidenceScore = this.clamp(input.targetConfidence / 100);
    const sourceScore = this.clamp(sourceWeights?.[input.impactSource] || 0.5);

    const weighted =
      distanceScore * Number(weights.distance || 0) +
      timeScore * Number(weights.timeDelta || 0) +
      typeScore * Number(weights.targetType || 0) +
      rangeScore * Number(weights.maxRange || 0) +
      freshnessScore * Number(weights.freshness || 0) +
      confidenceScore * Number(weights.confidence || 0);

    const score = Math.round(this.clamp(weighted * sourceScore + weighted * 0.25) * 100);

    return {
      score,
      reasonJson: {
        distanceScore,
        timeScore,
        rangeScore,
        typeScore,
        freshnessScore,
        confidenceScore,
        sourceScore,
        maxDistanceM,
        maxTimeDeltaSec,
        maxRangeM,
      },
    };
  }

  private freshness(value?: Date | string | null): number {
    if (!value) return 0.2;
    const ageHours = (Date.now() - new Date(value).getTime()) / 36e5;
    return this.clamp(1 - ageHours / 168);
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }
}
