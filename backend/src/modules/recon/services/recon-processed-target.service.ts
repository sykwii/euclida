import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReconEventsService } from '../events/recon-events.service';

@Injectable()
export class ReconProcessedTargetService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: ReconEventsService,
  ) {}

  async createPendingIfNeeded(targetId: string, observationId: string): Promise<void> {
    const [target] = await this.dataSource.query(`SELECT status FROM recon_targets WHERE id = $1`, [targetId]);
    if (!target || target.status !== 'processed') return;
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_processed_target_decisions (target_id, observation_id, status, payload)
       VALUES ($1, $2, 'pending', '{}'::jsonb)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [targetId, observationId],
    );
    if (row?.id) {
      await this.events.record('recon:target-updated-after-new-observation', 'recon_target', targetId, {
        observationId,
        decisionId: row.id,
      });
    }
  }

  pending(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT d.id, d.target_id AS "targetId", d.observation_id AS "observationId", d.status, d.created_at AS "createdAt",
        t.target_type AS "targetType", t.mgrs AS "targetMgrs", o.mgrs AS "observationMgrs", o.observation_datetime AS "observationDatetime"
       FROM recon_processed_target_decisions d
       JOIN recon_targets t ON t.id = d.target_id
       JOIN recon_observations o ON o.id = d.observation_id
       WHERE d.status = 'pending'
       ORDER BY d.created_at DESC
       LIMIT 200`,
    );
  }

  async decide(targetId: string, observationId: string, decision: 'attach' | 'new_target' | 'ignore'): Promise<void> {
    const [row] = await this.dataSource.query(
      `UPDATE recon_processed_target_decisions
       SET status = 'decided', decision = $3, decided_at = now()
       WHERE target_id = $1 AND observation_id = $2 AND status = 'pending'
       RETURNING id`,
      [targetId, observationId, decision],
    );
    if (!row) throw new NotFoundException('Рішення не знайдено');

    if (decision === 'attach') {
      await this.dataSource.query(
        `INSERT INTO recon_target_observations (target_id, observation_id, link_type)
         VALUES ($1, $2, 'operator_processed') ON CONFLICT DO NOTHING`,
        [targetId, observationId],
      );
    }

    if (decision === 'new_target') {
      const [observation] = await this.dataSource.query(
        `SELECT target_type AS "targetType", lat, lng, mgrs FROM recon_observations WHERE id = $1`,
        [observationId],
      );
      if (observation) {
        const [target] = await this.dataSource.query(
          `INSERT INTO recon_targets (target_type, possible_target_types, status, center, lat, lng, mgrs)
           VALUES ($1, $2::jsonb, 'candidate', ST_SetSRID(ST_MakePoint($4, $3), 4326), $3, $4, $5)
           RETURNING id`,
          [
            observation.targetType,
            JSON.stringify([observation.targetType]),
            observation.lat,
            observation.lng,
            observation.mgrs,
          ],
        );
        await this.dataSource.query(
          `INSERT INTO recon_target_observations (target_id, observation_id, link_type)
           VALUES ($1, $2, 'operator_split') ON CONFLICT DO NOTHING`,
          [target.id, observationId],
        );
      }
    }

    await this.events.record('recon:target-updated-after-new-observation', 'recon_target', targetId, {
      observationId,
      decision,
    });
  }
}
