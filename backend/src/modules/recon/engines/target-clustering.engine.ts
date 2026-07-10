import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { latLngToMgrs } from '../../../common/geo/mgrs.util';
import { ActivityIndexEngine } from './activity-index.engine';
import { ConfidenceEngine } from './confidence.engine';
import { FreshnessEngine } from './freshness.engine';
import { ThreatIndexEngine } from './threat-index.engine';
import { ReconSettingsService } from '../services/recon-settings.service';
import { ReconEventsService } from '../events/recon-events.service';

@Injectable()
export class TargetClusteringEngine {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: ReconSettingsService,
    private readonly confidence: ConfidenceEngine,
    private readonly activity: ActivityIndexEngine,
    private readonly freshness: FreshnessEngine,
    private readonly threat: ThreatIndexEngine,
    private readonly events: ReconEventsService,
  ) {}

  async processObservation(observationId: string): Promise<void> {
    const [observation] = await this.dataSource.query(
      `SELECT id, target_type AS "targetType", observation_datetime AS "observationDatetime", lat, lng
       FROM recon_observations WHERE id = $1 AND status = 'active'`,
      [observationId],
    );
    if (!observation) return;

    const radius = await this.settings.clusteringRadius(observation.targetType);
    const observations = await this.dataSource.query(
      `SELECT id, source, target_type AS "targetType", observation_datetime AS "observationDatetime", lat, lng
       FROM recon_observations
       WHERE status = 'active'
         AND target_type = $1
         AND observation_datetime BETWEEN $2::timestamptz - interval '48 hours' AND $2::timestamptz + interval '48 hours'
         AND ST_DWithin(geometry::geography, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5)
       ORDER BY observation_datetime DESC`,
      [observation.targetType, observation.observationDatetime, observation.lng, observation.lat, radius],
    );

    if (observations.length < 2) return;

    const linked = await this.dataSource.query(
      `SELECT target_id FROM recon_target_observations WHERE observation_id = ANY($1::uuid[]) LIMIT 1`,
      [observations.map((item: { id: string }) => item.id)],
    );
    if (linked.length > 0) return;

    const lat = this.average(observations.map((item: { lat: number }) => Number(item.lat)));
    const lng = this.average(observations.map((item: { lng: number }) => Number(item.lng)));
    const indexes = this.indexes(observation.targetType, observations);
    const [target] = await this.dataSource.query(
      `INSERT INTO recon_targets (
        target_type, possible_target_types, status, center, lat, lng, mgrs,
        semi_major_m, semi_minor_m, confidence_index, confidence_label, activity_index, freshness_index, threat_index
       )
       VALUES ($1, $2::jsonb, 'candidate', ST_SetSRID(ST_MakePoint($3, $4), 4326), $4, $3, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        observation.targetType,
        JSON.stringify([observation.targetType]),
        lng,
        lat,
        latLngToMgrs(lat, lng),
        Math.max(radius, 250),
        Math.max(radius / 2, 100),
        indexes.confidenceIndex,
        indexes.confidenceLabel,
        indexes.activityIndex,
        indexes.freshnessIndex,
        indexes.threatIndex,
      ],
    );

    for (const item of observations) {
      await this.dataSource.query(
        `INSERT INTO recon_target_observations (target_id, observation_id, link_type)
         VALUES ($1, $2, 'clustered') ON CONFLICT DO NOTHING`,
        [target.id, item.id],
      );
    }
    await this.events.record('recon:target-created', 'recon_target', target.id, { observationIds: observations.map((item: { id: string }) => item.id) });
  }

  indexes(targetType: string, observations: Array<{ source: string; observationDatetime?: string }>): Record<string, number | string> {
    const confidence = this.confidence.calculate(observations);
    const now = Date.now();
    const count24h = observations.filter((item) => now - new Date(item.observationDatetime || 0).getTime() <= 86400000).length;
    const activity = this.activity.calculate(count24h, observations.length);
    const latest = observations
      .map((item) => item.observationDatetime)
      .filter(Boolean)
      .sort()
      .at(-1);
    const freshness = this.freshness.calculate(latest);
    const threat = this.threat.calculate(targetType, confidence.index, activity, freshness);
    return {
      confidenceIndex: confidence.index,
      confidenceLabel: confidence.label,
      activityIndex: activity,
      freshnessIndex: freshness,
      threatIndex: threat,
    };
  }

  private average(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  }
}
