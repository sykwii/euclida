import { Injectable } from '@nestjs/common';
import { DEFAULT_RECON_SETTINGS } from '../settings/recon-default-settings';

@Injectable()
export class ConfidenceEngine {
  calculate(observations: Array<{ source: string }>, confirmed = false): { index: number; label: string } {
    if (confirmed) {
      return { index: 100, label: 'confirmed' };
    }

    const weights = DEFAULT_RECON_SETTINGS.sourceWeights as Record<string, number>;
    const sourceScore = observations.reduce((sum, item) => sum + (weights[item.source] || 0.5), 0);
    const diversity = new Set(observations.map((item) => item.source)).size;
    const index = Math.min(99, Math.round(sourceScore * 28 + diversity * 10));

    if (index >= 90) return { index, label: 'confirmed' };
    if (index >= 75) return { index, label: 'high' };
    if (index >= 55) return { index, label: 'medium' };
    return { index, label: 'low' };
  }
}
