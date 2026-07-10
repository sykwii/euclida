import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReconEventsService } from '../events/recon-events.service';

@Injectable()
export class PuarProposalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: ReconEventsService,
  ) {}

  list(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, target_id AS "targetId", observation_id AS "observationId", source_kind AS "sourceKind",
        status, payload, comments, accepted_service_order_id AS "acceptedServiceOrderId",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM recon_puar_proposals
       ORDER BY created_at DESC
       LIMIT 300`,
    );
  }

  async findOne(id: string): Promise<Record<string, unknown>> {
    const [row] = await this.dataSource.query(
      `SELECT id, target_id AS "targetId", observation_id AS "observationId", source_kind AS "sourceKind",
        status, payload, comments, accepted_service_order_id AS "acceptedServiceOrderId",
        created_at AS "createdAt", updated_at AS "updatedAt"
       FROM recon_puar_proposals WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException('Пропозицію ПУАР не знайдено');
    return row;
  }

  async create(input: { targetId?: string; observationId?: string; comments?: string }): Promise<Record<string, unknown>> {
    if (!input.targetId && !input.observationId) {
      throw new BadRequestException('Вкажіть ціль або спостереження');
    }
    const snapshot = input.targetId
      ? await this.targetSnapshot(input.targetId)
      : await this.observationSnapshot(input.observationId as string);
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_puar_proposals (target_id, observation_id, source_kind, status, payload, comments)
       VALUES ($1, $2, $3, 'draft', $4::jsonb, $5)
       RETURNING id, target_id AS "targetId", observation_id AS "observationId", source_kind AS "sourceKind",
        status, payload, comments, created_at AS "createdAt"`,
      [
        input.targetId || null,
        input.observationId || null,
        input.targetId ? 'target' : 'observation',
        JSON.stringify(snapshot),
        input.comments || null,
      ],
    );
    await this.events.record('recon:puar-created', 'recon_puar_proposal', row.id, {
      targetId: input.targetId,
      observationId: input.observationId,
    });
    return row;
  }

  async markAccepted(id: string, serviceOrderId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE recon_puar_proposals
       SET status = 'accepted', accepted_service_order_id = $2, accepted_at = now(), updated_at = now()
       WHERE id = $1`,
      [id, serviceOrderId],
    );
    await this.events.record('recon:core-puar-accepted', 'recon_puar_proposal', id, { serviceOrderId });
  }

  private async targetSnapshot(id: string): Promise<Record<string, unknown>> {
    const [target] = await this.dataSource.query(
      `SELECT id, target_type AS "targetType", status, lat, lng, mgrs,
        confidence_index AS "confidence", activity_index AS "activity",
        freshness_index AS "freshness", threat_index AS "threat"
       FROM recon_targets WHERE id = $1`,
      [id],
    );
    if (!target) throw new NotFoundException('Ціль не знайдено');
    const [assessment] = await this.dataSource.query(
      `SELECT assessment_type AS "assessmentType", status, notes
       FROM recon_assessments WHERE target_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    const history = await this.dataSource.query(
      `SELECT o.id, o.source, o.observation_datetime AS "at", o.lat, o.lng, o.mgrs
       FROM recon_observations o
       JOIN recon_target_observations link ON link.observation_id = o.id
       WHERE link.target_id = $1
       ORDER BY o.observation_datetime DESC LIMIT 50`,
      [id],
    );
    const correlations = await this.dataSource.query(
      `SELECT id, impact_id AS "impactId", score, status, distance_m AS "distanceM"
       FROM recon_correlations WHERE target_id = $1 ORDER BY score DESC LIMIT 20`,
      [id],
    );
    return { source: 'target', target, assessment: assessment || null, history, correlations };
  }

  private async observationSnapshot(id: string): Promise<Record<string, unknown>> {
    const [observation] = await this.dataSource.query(
      `SELECT id, source, target_type AS "targetType", observation_datetime AS "at", lat, lng, mgrs, notes
       FROM recon_observations WHERE id = $1`,
      [id],
    );
    if (!observation) throw new NotFoundException('Спостереження не знайдено');
    return { source: 'observation', observation, history: [observation], correlations: [] };
  }
}
