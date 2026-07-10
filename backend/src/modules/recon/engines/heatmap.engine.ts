import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReconSettingsService } from '../services/recon-settings.service';

@Injectable()
export class HeatmapEngine {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: ReconSettingsService,
  ) {}

  async calculate(query: {
    type: string;
    period: string;
    from?: string;
    to?: string;
  }): Promise<Record<string, unknown>> {
    const bounds = this.bounds(query.period, query.from, query.to);
    const allSettings = await this.settings.getAll();
    const heatmap = allSettings['heatmap'] as {
      gridPrecision?: number;
      maxPoints?: number;
      weights?: Record<string, number>;
    };
    const precision = Math.max(1, Math.min(5, Number(heatmap.gridPrecision || 3)));
    const limit = Math.max(1, Math.min(5000, Number(heatmap.maxPoints || 2000)));

    if (query.type === 'target' || query.type === 'threat') {
      const rows = await this.dataSource.query(
        `SELECT round(lat::numeric, $3)::double precision AS lat,
          round(lng::numeric, $3)::double precision AS lng,
          count(*)::int AS count,
          avg(confidence_index)::double precision AS confidence,
          avg(freshness_index)::double precision AS freshness,
          avg(CASE WHEN $4 = 'threat' THEN threat_index ELSE activity_index END)::double precision AS intensity
         FROM recon_targets
         WHERE archived_at IS NULL AND created_at BETWEEN $1::timestamptz AND $2::timestamptz
         GROUP BY 1, 2
         ORDER BY intensity DESC
         LIMIT $5`,
        [bounds.from, bounds.to, precision, query.type, limit],
      );
      return { type: query.type, period: query.period, ...bounds, points: rows };
    }

    const rows = await this.dataSource.query(
      `SELECT round(o.lat::numeric, $3)::double precision AS lat,
        round(o.lng::numeric, $3)::double precision AS lng,
        count(*)::int AS count,
        avg(COALESCE(t.confidence_index, 35))::double precision AS confidence,
        avg(GREATEST(0, 100 - extract(epoch from (now() - o.observation_datetime)) / 3600 * 4))::double precision AS freshness,
        (count(*) * 10 + avg(COALESCE(t.confidence_index, 35)) * 0.4) AS intensity
       FROM recon_observations o
       LEFT JOIN recon_target_observations link ON link.observation_id = o.id
       LEFT JOIN recon_targets t ON t.id = link.target_id
       WHERE o.status = 'active' AND o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
       GROUP BY 1, 2
       ORDER BY intensity DESC
       LIMIT $4`,
      [bounds.from, bounds.to, precision, limit],
    );
    return { type: query.type, period: query.period, ...bounds, points: rows };
  }

  private bounds(period: string, from?: string, to?: string): { from: string; to: string } {
    const now = new Date();
    const end = to || now.toISOString();
    if (period === 'custom' && from) return { from, to: end };
    if (period === 'today') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return { from: start.toISOString(), to: end };
    }
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: end };
  }
}
