import { Injectable } from '@nestjs/common';
import { HeatmapEngine } from '../engines/heatmap.engine';
import { ReconEventsService } from '../events/recon-events.service';

@Injectable()
export class ReconHeatmapService {
  constructor(
    private readonly engine: HeatmapEngine,
    private readonly events: ReconEventsService,
  ) {}

  async get(query: { type?: string; period?: string; from?: string; to?: string }): Promise<Record<string, unknown>> {
    const result = await this.engine.calculate({
      type: query.type || 'observation',
      period: query.period || '24h',
      from: query.from,
      to: query.to,
    });
    await this.events.record('recon:heatmap-updated', 'recon_heatmap', null, {
      type: query.type || 'observation',
      period: query.period || '24h',
    });
    return result;
  }
}
