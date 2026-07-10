import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CorrelationEngine } from '../engines/correlation.engine';
import { ReconEventsService } from '../events/recon-events.service';
import { ReconSettingsService } from './recon-settings.service';

@Injectable()
export class ReconCorrelationService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly engine: CorrelationEngine,
    private readonly settings: ReconSettingsService,
    private readonly events: ReconEventsService,
  ) {}

  list(limit = 200, offset = 0): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, target_id AS "targetId", impact_id AS "impactId", status, score,
        reason_json AS "reasonJson", distance_m AS "distanceM", time_delta_sec AS "timeDeltaSec",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM recon_correlations
       ORDER BY updated_at DESC
       LIMIT $1 OFFSET $2`,
      [this.limit(limit), this.offset(offset)],
    );
  }

  byTarget(targetId: string): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT c.*, c.target_id AS "targetId", c.impact_id AS "impactId",
        c.reason_json AS "reasonJson", c.distance_m AS "distanceM", c.time_delta_sec AS "timeDeltaSec",
        i.lat AS "impactLat", i.lng AS "impactLng", i.impact_datetime AS "impactDatetime"
       FROM recon_correlations c
       JOIN recon_impact_observations i ON i.id = c.impact_id
       WHERE c.target_id = $1
       ORDER BY c.score DESC, c.updated_at DESC
       LIMIT 200`,
      [targetId],
    );
  }

  byImpact(impactId: string): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT c.*, c.target_id AS "targetId", c.impact_id AS "impactId",
        c.reason_json AS "reasonJson", c.distance_m AS "distanceM", c.time_delta_sec AS "timeDeltaSec",
        t.lat AS "targetLat", t.lng AS "targetLng", t.target_type AS "targetType"
       FROM recon_correlations c
       JOIN recon_targets t ON t.id = c.target_id
       WHERE c.impact_id = $1
       ORDER BY c.score DESC, c.updated_at DESC
       LIMIT 200`,
      [impactId],
    );
  }

  async recalculate(input: { targetId?: string; impactId?: string; from?: string; to?: string }): Promise<Record<string, unknown>> {
    const settings = await this.settings.getAll();
    const correlation = settings['correlation'] as { maxDistanceM?: number; maxTimeDeltaHours?: number; minScore?: number };
    const maxDistanceM = Number(correlation.maxDistanceM || 3000);
    const maxTimeDeltaHours = Number(correlation.maxTimeDeltaHours || 72);
    const minScore = Number(correlation.minScore || 35);
    const from = input.from || new Date(Date.now() - 30 * 86400000).toISOString();
    const to = input.to || new Date().toISOString();

    const pairs = await this.dataSource.query(
      `SELECT t.id AS "targetId", t.target_type AS "targetType", t.confidence_index AS "targetConfidence",
        t.updated_at AS "targetUpdatedAt", i.id AS "impactId", i.source AS "impactSource",
        ST_Distance(t.center::geography, i.geometry::geography) AS "distanceM",
        abs(extract(epoch from (i.impact_datetime - t.updated_at)))::int AS "timeDeltaSec"
       FROM recon_targets t
       JOIN recon_impact_observations i
         ON i.status = 'active'
        AND i.impact_datetime BETWEEN $3::timestamptz AND $4::timestamptz
        AND abs(extract(epoch from (i.impact_datetime - t.updated_at))) <= $2 * 3600
        AND ST_DWithin(t.center::geography, i.geometry::geography, $1)
       WHERE t.archived_at IS NULL
         AND ($5::uuid IS NULL OR t.id = $5::uuid)
         AND ($6::uuid IS NULL OR i.id = $6::uuid)
       ORDER BY i.impact_datetime DESC
       LIMIT 5000`,
      [maxDistanceM, maxTimeDeltaHours, from, to, input.targetId || null, input.impactId || null],
    );

    let created = 0;
    let updated = 0;
    for (const pair of pairs) {
      const result = await this.engine.score(pair);
      if (result.score < minScore) continue;
      const [row] = await this.dataSource.query(
        `INSERT INTO recon_correlations (target_id, impact_id, status, score, reason_json, distance_m, time_delta_sec, payload)
         VALUES ($1, $2, 'suggested', $3, $4::jsonb, $5, $6, $7::jsonb)
         ON CONFLICT (target_id, impact_id) DO UPDATE
           SET score = EXCLUDED.score,
               reason_json = EXCLUDED.reason_json,
               distance_m = EXCLUDED.distance_m,
               time_delta_sec = EXCLUDED.time_delta_sec,
               updated_at = now()
           WHERE recon_correlations.status = 'suggested'
         RETURNING id, xmax = 0 AS inserted`,
        [
          pair.targetId,
          pair.impactId,
          result.score,
          JSON.stringify(result.reasonJson),
          Number(pair.distanceM),
          Number(pair.timeDeltaSec),
          JSON.stringify({ recalculatedAt: new Date().toISOString() }),
        ],
      );
      if (row?.inserted) {
        created += 1;
        await this.events.record('recon:correlation-created', 'recon_correlation', row.id, {
          targetId: pair.targetId,
          impactId: pair.impactId,
          score: result.score,
        });
      } else if (row?.id) {
        updated += 1;
        await this.events.record('recon:correlation-updated', 'recon_correlation', row.id, {
          targetId: pair.targetId,
          impactId: pair.impactId,
          score: result.score,
        });
      }
    }

    return { checked: pairs.length, created, updated };
  }

  async accept(id: string): Promise<void> {
    await this.setStatus(id, 'accepted', 'accepted_at');
  }

  async reject(id: string): Promise<void> {
    await this.setStatus(id, 'rejected', 'rejected_at');
  }

  private async setStatus(id: string, status: 'accepted' | 'rejected', column: 'accepted_at' | 'rejected_at'): Promise<void> {
    const result = await this.dataSource.query(
      `UPDATE recon_correlations SET status = $2, ${column} = now(), updated_at = now() WHERE id = $1 RETURNING id`,
      [id, status],
    );
    if (result.length === 0) throw new NotFoundException('Кореляцію не знайдено');
    await this.events.record('recon:correlation-updated', 'recon_correlation', id, { status });
  }

  private limit(value: number): number {
    return Math.max(1, Math.min(1000, Number(value) || 200));
  }

  private offset(value: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
  }
}
