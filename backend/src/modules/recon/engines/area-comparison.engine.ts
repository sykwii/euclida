import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AreaComparisonEngine {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async compare(from: string, to: string): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT a.id, a.name,
        count(DISTINCT o.id)::int AS observations,
        count(DISTINCT i.id)::int AS impacts,
        count(DISTINCT t.id)::int AS targets,
        avg(t.threat_index)::double precision AS "avgThreat"
       FROM recon_areas a
       LEFT JOIN recon_observations o ON o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
        AND ST_Contains(a.geometry, o.geometry)
       LEFT JOIN recon_impact_observations i ON i.impact_datetime BETWEEN $1::timestamptz AND $2::timestamptz
        AND ST_Contains(a.geometry, i.geometry)
       LEFT JOIN recon_targets t ON t.created_at BETWEEN $1::timestamptz AND $2::timestamptz
        AND ST_Contains(a.geometry, t.center)
       WHERE a.archived_at IS NULL
       GROUP BY a.id, a.name
       ORDER BY observations DESC, impacts DESC
       LIMIT 200`,
      [from, to],
    );
  }
}
