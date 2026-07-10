import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DailyReportEngine {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async build(day?: string): Promise<Record<string, unknown>> {
    const date = day ? new Date(day) : new Date();
    const from = new Date(date);
    from.setHours(0, 0, 0, 0);
    const to = new Date(date);
    to.setHours(23, 59, 59, 999);
    const params = [from.toISOString(), to.toISOString()];

    const [summary] = await this.dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM recon_observations WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz) AS observations,
        (SELECT count(*)::int FROM recon_impact_observations WHERE impact_datetime BETWEEN $1::timestamptz AND $2::timestamptz) AS impacts,
        (SELECT count(*)::int FROM recon_targets WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz) AS targets,
        (SELECT count(*)::int FROM recon_targets WHERE status = 'confirmed') AS confirmed,
        (SELECT count(*)::int FROM recon_targets WHERE status = 'candidate') AS candidate,
        (SELECT count(*)::int FROM recon_targets WHERE status = 'processed') AS processed`,
      params,
    );
    const topAreas = await this.dataSource.query(
      `SELECT a.name, count(o.id)::int AS count
       FROM recon_areas a
       JOIN recon_observations o ON ST_Contains(a.geometry, o.geometry)
       WHERE o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
       GROUP BY a.id, a.name
       ORDER BY count DESC
       LIMIT 10`,
      params,
    );
    const topWeaponTypes = await this.dataSource.query(
      `SELECT target_type AS "targetType", count(*)::int AS count
       FROM recon_observations
       WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
       GROUP BY target_type
       ORDER BY count DESC`,
      params,
    );
    const topCorrelations = await this.dataSource.query(
      `SELECT id, target_id AS "targetId", impact_id AS "impactId", score, distance_m AS "distanceM"
       FROM recon_correlations
       WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
       ORDER BY score DESC
       LIMIT 10`,
      params,
    );

    return { day: from.toISOString().slice(0, 10), summary, topAreas, topWeaponTypes, topCorrelations };
  }
}
