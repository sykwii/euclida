import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AreaComparisonEngine } from '../engines/area-comparison.engine';
import { DailyReportEngine } from '../engines/daily-report.engine';
import { ReconEventsService } from '../events/recon-events.service';
import { ReconSettingsService } from './recon-settings.service';

@Injectable()
export class ReconAnalyticsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly areaComparison: AreaComparisonEngine,
    private readonly dailyReport: DailyReportEngine,
    private readonly events: ReconEventsService,
    private readonly settings: ReconSettingsService,
  ) {}

  async basic(range = '24h', from?: string, to?: string): Promise<Record<string, unknown>> {
    const bounds = this.resolveBounds(range, from, to);
    const [summary] = await this.dataSource.query(
      `SELECT
        (SELECT count(*)::int FROM recon_observations WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'active') AS observations,
        (SELECT count(*)::int FROM recon_impact_observations WHERE impact_datetime BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'active') AS impacts,
        (SELECT count(*)::int FROM recon_targets WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz AND archived_at IS NULL) AS targets,
        (SELECT count(*)::int FROM recon_targets WHERE updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'confirmed' AND archived_at IS NULL) AS confirmed,
        (SELECT count(*)::int FROM recon_targets WHERE updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'processed' AND archived_at IS NULL) AS processed,
        (
          SELECT a.name
          FROM recon_areas a
          JOIN recon_observations o
            ON o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
           AND o.status = 'active'
           AND ST_Contains(a.geometry, o.geometry)
          WHERE a.archived_at IS NULL
          GROUP BY a.id, a.name
          ORDER BY count(o.id) DESC, a.name ASC
          LIMIT 1
        ) AS "mostActiveArea"`,
      [bounds.from, bounds.to],
    );
    const byType = await this.dataSource.query(
      `SELECT target_type AS "targetType", count(*)::int AS count
       FROM recon_observations
       WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'active'
       GROUP BY target_type
       ORDER BY count DESC`,
      [bounds.from, bounds.to],
    );
    const bySource = await this.dataSource.query(
      `SELECT source, count(*)::int AS count
       FROM recon_observations
       WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'active'
       GROUP BY source
       ORDER BY count DESC`,
      [bounds.from, bounds.to],
    );
    const byConfidence = await this.dataSource.query(
      `SELECT confidence_label AS "confidenceLabel", count(*)::int AS count
       FROM recon_targets
       WHERE archived_at IS NULL
         AND updated_at BETWEEN $1::timestamptz AND $2::timestamptz
       GROUP BY confidence_label
       ORDER BY count DESC`,
      [bounds.from, bounds.to],
    );
    const daily = await this.dataSource.query(
      `SELECT date_trunc('day', observation_datetime)::date AS day, count(*)::int AS observations
       FROM recon_observations
       WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'active'
       GROUP BY day
       ORDER BY day ASC`,
      [bounds.from, bounds.to],
    );
    return { range, from: bounds.from, to: bounds.to, summary, byType, bySource, byConfidence, daily };
  }

  async full(range = '24h', from?: string, to?: string): Promise<Record<string, unknown>> {
    const bounds = this.resolveBounds(range, from, to);
    const [basic, areaComparison, activityTrends, targetTrends, sourceStats, weaponStats, confidenceStats] =
      await Promise.all([
        this.basic(range, bounds.from, bounds.to),
        this.areaComparison.compare(bounds.from, bounds.to),
        this.dataSource.query(
          `SELECT date_trunc('day', observation_datetime)::date AS day, count(*)::int AS count
           FROM recon_observations
           WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
           GROUP BY day ORDER BY day ASC`,
          [bounds.from, bounds.to],
        ),
        this.dataSource.query(
          `SELECT date_trunc('day', created_at)::date AS day, target_type AS "targetType", count(*)::int AS count
           FROM recon_targets
           WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
           GROUP BY day, target_type ORDER BY day ASC`,
          [bounds.from, bounds.to],
        ),
        this.dataSource.query(
          `SELECT source, count(*)::int AS count
           FROM recon_observations
           WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
           GROUP BY source ORDER BY count DESC`,
          [bounds.from, bounds.to],
        ),
        this.dataSource.query(
          `SELECT target_type AS "targetType", count(*)::int AS count
           FROM recon_targets
           WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz
           GROUP BY target_type ORDER BY count DESC`,
          [bounds.from, bounds.to],
        ),
        this.dataSource.query(
          `SELECT confidence_label AS "confidenceLabel", count(*)::int AS count, avg(confidence_index)::double precision AS average
           FROM recon_targets
           WHERE archived_at IS NULL
             AND updated_at BETWEEN $1::timestamptz AND $2::timestamptz
           GROUP BY confidence_label ORDER BY average DESC`,
          [bounds.from, bounds.to],
        ),
      ]);

    const [priorityTargets, recentChanges, sourceEffectiveness, funnel] = await Promise.all([
      this.dataSource.query(
        `SELECT
          t.id,
          t.target_type AS "targetType",
          t.status,
          t.mgrs,
          t.confidence_index AS "confidenceIndex",
          t.activity_index AS "activityIndex",
          t.freshness_index AS "freshnessIndex",
          t.threat_index AS "threatIndex",
          coalesce(a.name, 'Поза районом') AS area,
          (
            SELECT count(*)::int
            FROM recon_correlations c
            WHERE c.target_id = t.id AND c.status = 'accepted'
          ) AS "acceptedCorrelations"
        FROM recon_targets t
        LEFT JOIN recon_areas a ON a.archived_at IS NULL AND ST_Contains(a.geometry, t.center)
        WHERE t.archived_at IS NULL
          AND t.updated_at BETWEEN $1::timestamptz AND $2::timestamptz
        ORDER BY t.threat_index DESC, t.confidence_index DESC, t.updated_at DESC
        LIMIT 15`,
        [bounds.from, bounds.to],
      ),
      this.dataSource.query(
        `SELECT
          (SELECT count(*)::int FROM recon_targets WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz) AS "newTargets",
          (SELECT count(*)::int FROM recon_targets WHERE updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND activity_index >= 60) AS "reactivatedTargets",
          (SELECT count(*)::int FROM recon_targets WHERE updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND freshness_index <= 25) AS "staleTargets",
          (SELECT count(*)::int FROM recon_correlations WHERE updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND status = 'accepted') AS "acceptedCorrelations"`,
        [bounds.from, bounds.to],
      ).then((rows) => rows[0] || {}),
      this.dataSource.query(
        `SELECT
          o.source,
          count(*)::int AS "reportsCount",
          round(avg(CASE WHEN link.target_id IS NOT NULL THEN 100 ELSE 0 END)::numeric, 2)::double precision AS "linkedToTargetPct",
          round(avg(CASE WHEN t.status = 'confirmed' THEN 100 ELSE 0 END)::numeric, 2)::double precision AS "confirmedPct",
          round(avg(CASE WHEN p.id IS NOT NULL THEN 100 ELSE 0 END)::numeric, 2)::double precision AS "puarPct"
        FROM recon_observations o
        LEFT JOIN recon_target_observations link ON link.observation_id = o.id
        LEFT JOIN recon_targets t ON t.id = link.target_id
        LEFT JOIN recon_puar_proposals p ON p.observation_id = o.id
        WHERE o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
        GROUP BY o.source
        ORDER BY "reportsCount" DESC`,
        [bounds.from, bounds.to],
      ),
      this.dataSource.query(
        `SELECT
          (SELECT count(*)::int FROM recon_observations WHERE observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz) AS observations,
          (SELECT count(*)::int FROM recon_targets WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz) AS targets,
          (SELECT count(*)::int FROM recon_puar_proposals WHERE created_at BETWEEN $1::timestamptz AND $2::timestamptz) AS puar,
          (
            SELECT count(*)::int
            FROM service_orders
            WHERE source_puar_proposal_id IS NOT NULL
              AND created_at BETWEEN $1::timestamptz AND $2::timestamptz
          ) AS core`,
        [bounds.from, bounds.to],
      ).then((rows) => rows[0] || {}),
    ]);

    return {
      range,
      from: bounds.from,
      to: bounds.to,
      basic,
      areaComparison,
      activityTrends,
      targetTrends,
      sourceStats,
      weaponStats,
      confidenceStats,
      priorityTargets: priorityTargets.map((target: Record<string, unknown>) => ({
        ...target,
        recommendation: this.recommendation(target),
      })),
      recentChanges,
      sourceEffectiveness,
      decisionFunnel: funnel,
      conclusion: this.buildConclusion(basic, recentChanges, priorityTargets),
    };
  }

  async areas(query: {
    primaryFrom?: string;
    primaryTo?: string;
    compareFrom?: string;
    compareTo?: string;
    includeHistorical?: boolean;
    targetType?: string;
    source?: string;
  }): Promise<Record<string, unknown>[]> {
    const primary = this.resolveExplicitBounds(query.primaryFrom, query.primaryTo);
    const comparison = this.resolveExplicitBounds(query.compareFrom, query.compareTo);
    const [settings, primaryRows, comparisonRows, areaSourceEffectiveness, areaFunnels] = await Promise.all([
      this.settings.getAll(),
      this.areaPeriodMetrics(primary.from, primary.to, Boolean(query.includeHistorical), query.targetType, query.source),
      this.areaPeriodMetrics(comparison.from, comparison.to, Boolean(query.includeHistorical), query.targetType, query.source),
      this.areaSourceEffectiveness(primary.from, primary.to, Boolean(query.includeHistorical), query.targetType, query.source),
      this.areaFunnels(primary.from, primary.to, Boolean(query.includeHistorical), query.targetType, query.source),
    ]);

    const comparisonByAreaId = new Map(comparisonRows.map((row) => [String(row['areaId']), row]));
    const sourceEffectivenessByArea = new Map<string, Record<string, unknown>[]>();
    for (const row of areaSourceEffectiveness) {
      const areaId = String(row['areaId']);
      const bucket = sourceEffectivenessByArea.get(areaId) || [];
      bucket.push(row);
      sourceEffectivenessByArea.set(areaId, bucket);
    }
    const funnelByArea = new Map(areaFunnels.map((row) => [String(row['areaId']), row]));
    return primaryRows.map((row) => {
      const other = comparisonByAreaId.get(String(row['areaId'])) || this.emptyAreaMetrics(String(row['areaId']), String(row['name']), String(row['color']));
      const delta = this.buildAreaDelta(row, other);
      const changes = this.buildAreaChanges(row, other);
      const change = this.buildAreaChange(row, other);
      const recommendation = this.areaRecommendation(row, settings);
      const sourceEffectiveness = sourceEffectivenessByArea.get(String(row['areaId'])) || [];
      const decisionFunnel = funnelByArea.get(String(row['areaId'])) || { observations: 0, targets: 0, puar: 0, core: 0 };
      const dominantWeaponType = this.dominantWeaponType(row);
      return {
        areaId: row['areaId'],
        name: row['name'],
        color: row['color'],
        primary: row,
        comparison: other,
        delta,
        change,
        changes,
        recommendation: recommendation.recommendation,
        reasons: recommendation.reasons,
        dominantWeaponType,
        sourceEffectiveness,
        decisionFunnel,
        conclusion: this.buildAreaConclusion(row, other, changes, recommendation.recommendation, recommendation.reasons, dominantWeaponType),
      };
    });
  }

  async daily(day?: string): Promise<Record<string, unknown>> {
    const report = await this.dailyReport.build(day);
    await this.events.record('recon:daily-report-updated', 'recon_daily_report', null, {
      day: report['day'],
    });
    return report;
  }

  private resolveBounds(range: string, from?: string, to?: string): { from: string; to: string } {
    const end = to ? new Date(to) : new Date();
    if (range === 'custom' && from) {
      return {
        from: new Date(from).toISOString(),
        to: end.toISOString(),
      };
    }

    if (range === 'today') {
      const kyiv = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Kiev',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(end);
      const year = kyiv.find((part) => part.type === 'year')?.value || '1970';
      const month = kyiv.find((part) => part.type === 'month')?.value || '01';
      const day = kyiv.find((part) => part.type === 'day')?.value || '01';
      return {
        from: new Date(`${year}-${month}-${day}T00:00:00+03:00`).toISOString(),
        to: end.toISOString(),
      };
    }

    const days = range === '30d' ? 30 : range === '7d' ? 7 : 1;
    return {
      from: new Date(end.getTime() - days * 86400000).toISOString(),
      to: end.toISOString(),
    };
  }

  private resolveExplicitBounds(from?: string, to?: string): { from: string; to: string } {
    if (from && to) {
      return {
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
      };
    }
    return this.resolveBounds('24h');
  }

  private async areaPeriodMetrics(
    from: string,
    to: string,
    includeHistorical: boolean,
    targetType?: string,
    source?: string,
  ): Promise<Record<string, unknown>[]> {
    const activeStatuses = includeHistorical ? ['active', 'hidden', 'archived'] : ['active'];
    return this.dataSource.query(
      `WITH observation_metrics AS (
          SELECT
            a.id AS area_id,
            count(DISTINCT o.id)::int AS observations,
            count(DISTINCT CASE WHEN o.target_type = 'mortar' THEN o.id END)::int AS mortar,
            count(DISTINCT CASE WHEN o.target_type = 'tube_artillery' THEN o.id END)::int AS "tubeArtillery",
            count(DISTINCT CASE WHEN o.target_type = 'mlrs' THEN o.id END)::int AS mlrs,
            count(DISTINCT o.source)::int AS "sourceCount",
            max(o.observation_datetime) AS "newestObservationAt"
          FROM recon_areas a
          LEFT JOIN recon_observations o
            ON ST_Contains(a.geometry, o.geometry)
           AND o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
           AND o.status = ANY($3::varchar[])
           AND ($4::varchar IS NULL OR o.target_type = $4)
           AND ($5::varchar IS NULL OR o.source = $5)
          WHERE a.archived_at IS NULL
          GROUP BY a.id
       ),
       impact_metrics AS (
          SELECT
            a.id AS area_id,
            count(DISTINCT i.id)::int AS impacts,
            max(i.impact_datetime) AS "newestImpactAt"
          FROM recon_areas a
          LEFT JOIN recon_impact_observations i
            ON ST_Contains(a.geometry, i.geometry)
           AND i.impact_datetime BETWEEN $1::timestamptz AND $2::timestamptz
           AND i.status = ANY($3::varchar[])
           AND ($4::varchar IS NULL OR i.target_type = $4)
           AND ($5::varchar IS NULL OR i.source = $5)
          WHERE a.archived_at IS NULL
          GROUP BY a.id
       ),
       target_metrics AS (
          SELECT
            a.id AS area_id,
            count(DISTINCT t.id)::int AS targets,
            count(DISTINCT CASE WHEN t.created_at BETWEEN $1::timestamptz AND $2::timestamptz THEN t.id END)::int AS "newTargets",
            count(DISTINCT CASE WHEN t.status = 'confirmed' THEN t.id END)::int AS confirmed,
            count(DISTINCT CASE WHEN t.status = 'processed' THEN t.id END)::int AS processed,
            avg(coalesce(t.confidence_index, 0))::double precision AS "avgConfidence",
            avg(coalesce(t.activity_index, 0))::double precision AS "activityIndex",
            avg(coalesce(t.freshness_index, 0))::double precision AS "freshnessIndex",
            avg(coalesce(t.threat_index, 0))::double precision AS "threatIndex",
            max(t.updated_at) AS "newestTargetAt",
            array_remove(array_agg(DISTINCT CASE WHEN t.created_at BETWEEN $1::timestamptz AND $2::timestamptz THEN t.id END), NULL) AS "newTargetIds",
            array_remove(array_agg(DISTINCT CASE WHEN t.updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND coalesce(t.activity_index, 0) >= 60 THEN t.id END), NULL) AS "reactivatedTargetIds",
            array_remove(array_agg(DISTINCT CASE WHEN t.updated_at BETWEEN $1::timestamptz AND $2::timestamptz AND coalesce(t.freshness_index, 0) <= 25 THEN t.id END), NULL) AS "staleTargetIds",
            array_remove(array_agg(DISTINCT t.target_type), NULL) AS "weaponTypes"
          FROM recon_areas a
          LEFT JOIN recon_targets t
            ON ST_Contains(a.geometry, t.center)
           AND coalesce(t.updated_at, t.created_at) BETWEEN $1::timestamptz AND $2::timestamptz
           AND ($4::varchar IS NULL OR t.target_type = $4)
           AND ($3::varchar[] IS NULL OR t.status <> 'hidden' OR 'hidden' = ANY($3::varchar[]))
          WHERE a.archived_at IS NULL
            AND (t.archived_at IS NULL OR $6::boolean = true)
          GROUP BY a.id
       ),
       puar_metrics AS (
          SELECT
            a.id AS area_id,
            count(DISTINCT p.id)::int AS puar
          FROM recon_areas a
          LEFT JOIN recon_puar_proposals p
            ON p.created_at BETWEEN $1::timestamptz AND $2::timestamptz
          LEFT JOIN recon_targets t
            ON t.id = p.target_id
          LEFT JOIN recon_observations o
            ON o.id = p.observation_id
          WHERE a.archived_at IS NULL
            AND (
              (t.id IS NOT NULL AND ST_Contains(a.geometry, t.center))
              OR (o.id IS NOT NULL AND ST_Contains(a.geometry, o.geometry))
            )
          GROUP BY a.id
       ),
       correlation_metrics AS (
          SELECT
            a.id AS area_id,
            count(DISTINCT c.id)::int AS "acceptedCorrelations",
            array_remove(array_agg(DISTINCT c.id), NULL) AS "newAcceptedCorrelationIds"
          FROM recon_areas a
          LEFT JOIN recon_correlations c
            ON c.status = 'accepted'
           AND c.updated_at BETWEEN $1::timestamptz AND $2::timestamptz
          LEFT JOIN recon_targets t
            ON t.id = c.target_id
          LEFT JOIN recon_impact_observations i
            ON i.id = c.impact_id
          WHERE a.archived_at IS NULL
            AND (
              (t.id IS NOT NULL AND ST_Contains(a.geometry, t.center))
              OR (i.id IS NOT NULL AND ST_Contains(a.geometry, i.geometry))
            )
          GROUP BY a.id
       )
       SELECT
         a.id AS "areaId",
         a.name,
         '#1d4ed8'::varchar AS color,
         coalesce(o.observations, 0) AS observations,
         coalesce(i.impacts, 0) AS impacts,
         coalesce(t.targets, 0) AS targets,
         coalesce(t."newTargets", 0) AS "newTargets",
         coalesce(t.confirmed, 0) AS confirmed,
         coalesce(t.processed, 0) AS processed,
         coalesce(p.puar, 0) AS puar,
         coalesce(o.mortar, 0) AS mortar,
         coalesce(o."tubeArtillery", 0) AS "tubeArtillery",
         coalesce(o.mlrs, 0) AS mlrs,
         coalesce(o."sourceCount", 0) AS "sourceCount",
         coalesce(c."acceptedCorrelations", 0) AS "acceptedCorrelations",
         round(coalesce(t."avgConfidence", 0)::numeric, 2)::double precision AS "avgConfidence",
         round(coalesce(t."activityIndex", 0)::numeric, 2)::double precision AS "activityIndex",
         round(coalesce(t."freshnessIndex", 0)::numeric, 2)::double precision AS "freshnessIndex",
         round(coalesce(t."threatIndex", 0)::numeric, 2)::double precision AS "threatIndex",
         greatest(o."newestObservationAt", i."newestImpactAt", t."newestTargetAt") AS "newestActivityAt",
         coalesce(t."newTargetIds", '{}') AS "newTargetIds",
         coalesce(t."reactivatedTargetIds", '{}') AS "reactivatedTargetIds",
         coalesce(t."staleTargetIds", '{}') AS "staleTargetIds",
         coalesce(t."weaponTypes", '{}') AS "weaponTypes",
         coalesce(c."newAcceptedCorrelationIds", '{}') AS "newAcceptedCorrelationIds"
       FROM recon_areas a
       LEFT JOIN observation_metrics o ON o.area_id = a.id
       LEFT JOIN impact_metrics i ON i.area_id = a.id
       LEFT JOIN target_metrics t ON t.area_id = a.id
       LEFT JOIN puar_metrics p ON p.area_id = a.id
       LEFT JOIN correlation_metrics c ON c.area_id = a.id
       WHERE a.archived_at IS NULL
       ORDER BY a.name ASC`,
      [from, to, activeStatuses, targetType || null, source || null, includeHistorical],
    );
  }

  private emptyAreaMetrics(areaId: string, name: string, color: string): Record<string, unknown> {
    return {
      areaId,
      name,
      color,
      observations: 0,
      impacts: 0,
      targets: 0,
      newTargets: 0,
      confirmed: 0,
      processed: 0,
      puar: 0,
      mortar: 0,
      tubeArtillery: 0,
      mlrs: 0,
      sourceCount: 0,
      acceptedCorrelations: 0,
      avgConfidence: 0,
      activityIndex: 0,
      freshnessIndex: 0,
      threatIndex: 0,
      newestActivityAt: null,
      newTargetIds: [],
      reactivatedTargetIds: [],
      staleTargetIds: [],
      weaponTypes: [],
      newAcceptedCorrelationIds: [],
    };
  }

  private async areaSourceEffectiveness(
    from: string,
    to: string,
    includeHistorical: boolean,
    targetType?: string,
    source?: string,
  ): Promise<Record<string, unknown>[]> {
    const activeStatuses = includeHistorical ? ['active', 'hidden', 'archived'] : ['active'];
    return this.dataSource.query(
      `SELECT
        a.id AS "areaId",
        o.source,
        count(*)::int AS "reportsCount",
        round(avg(CASE WHEN link.target_id IS NOT NULL THEN 100 ELSE 0 END)::numeric, 2)::double precision AS "linkedToTargetPct",
        round(avg(CASE WHEN t.status = 'confirmed' THEN 100 ELSE 0 END)::numeric, 2)::double precision AS "confirmedPct",
        round(avg(CASE WHEN p.id IS NOT NULL THEN 100 ELSE 0 END)::numeric, 2)::double precision AS "puarPct"
       FROM recon_areas a
       JOIN recon_observations o
         ON ST_Contains(a.geometry, o.geometry)
        AND o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
        AND o.status = ANY($3::varchar[])
        AND ($4::varchar IS NULL OR o.target_type = $4)
        AND ($5::varchar IS NULL OR o.source = $5)
       LEFT JOIN recon_target_observations link ON link.observation_id = o.id
       LEFT JOIN recon_targets t ON t.id = link.target_id
       LEFT JOIN recon_puar_proposals p ON p.observation_id = o.id
       WHERE a.archived_at IS NULL
       GROUP BY a.id, o.source
       ORDER BY a.id, "reportsCount" DESC`,
      [from, to, activeStatuses, targetType || null, source || null],
    );
  }

  private async areaFunnels(
    from: string,
    to: string,
    includeHistorical: boolean,
    targetType?: string,
    source?: string,
  ): Promise<Record<string, unknown>[]> {
    const activeStatuses = includeHistorical ? ['active', 'hidden', 'archived'] : ['active'];
    return this.dataSource.query(
      `SELECT
        a.id AS "areaId",
        (
          SELECT count(*)::int
          FROM recon_observations o
          WHERE ST_Contains(a.geometry, o.geometry)
            AND o.observation_datetime BETWEEN $1::timestamptz AND $2::timestamptz
            AND o.status = ANY($3::varchar[])
            AND ($4::varchar IS NULL OR o.target_type = $4)
            AND ($5::varchar IS NULL OR o.source = $5)
        ) AS observations,
        (
          SELECT count(*)::int
          FROM recon_targets t
          WHERE ST_Contains(a.geometry, t.center)
            AND coalesce(t.updated_at, t.created_at) BETWEEN $1::timestamptz AND $2::timestamptz
            AND (t.archived_at IS NULL OR $6::boolean = true)
            AND ($4::varchar IS NULL OR t.target_type = $4)
        ) AS targets,
        (
          SELECT count(*)::int
          FROM recon_puar_proposals p
          LEFT JOIN recon_targets pt ON pt.id = p.target_id
          LEFT JOIN recon_observations po ON po.id = p.observation_id
          WHERE p.created_at BETWEEN $1::timestamptz AND $2::timestamptz
            AND (
              (pt.id IS NOT NULL AND ST_Contains(a.geometry, pt.center))
              OR (po.id IS NOT NULL AND ST_Contains(a.geometry, po.geometry))
            )
        ) AS puar,
        (
          SELECT count(*)::int
          FROM service_orders s
          LEFT JOIN recon_puar_proposals p ON p.id = s.source_puar_proposal_id
          LEFT JOIN recon_targets pt ON pt.id = p.target_id
          LEFT JOIN recon_observations po ON po.id = p.observation_id
          WHERE s.created_at BETWEEN $1::timestamptz AND $2::timestamptz
            AND s.source_puar_proposal_id IS NOT NULL
            AND (
              (pt.id IS NOT NULL AND ST_Contains(a.geometry, pt.center))
              OR (po.id IS NOT NULL AND ST_Contains(a.geometry, po.geometry))
            )
        ) AS core
       FROM recon_areas a
       WHERE a.archived_at IS NULL
       ORDER BY a.name ASC`,
      [from, to, activeStatuses, targetType || null, source || null, includeHistorical],
    );
  }

  private buildAreaDelta(primary: Record<string, unknown>, comparison: Record<string, unknown>): Record<string, unknown> {
    const keys = ['observations', 'impacts', 'targets', 'newTargets', 'confirmed', 'processed', 'puar', 'avgConfidence', 'activityIndex', 'freshnessIndex', 'threatIndex'];
    return Object.fromEntries(keys.map((key) => [key, Number(primary[key] || 0) - Number(comparison[key] || 0)]));
  }

  private buildAreaChange(primary: Record<string, unknown>, comparison: Record<string, unknown>): Record<string, unknown> {
    const primaryActivity = Number(primary['activityIndex'] || 0);
    const comparisonActivity = Number(comparison['activityIndex'] || 0);
    const delta = primaryActivity - comparisonActivity;
    const percent = comparisonActivity === 0 ? (primaryActivity > 0 ? 100 : 0) : Math.round((delta / comparisonActivity) * 100);
    return {
      direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable',
      percent,
      severity: percent >= 50 || primaryActivity >= 70 ? 'critical' : percent >= 20 || primaryActivity >= 45 ? 'attention' : 'normal',
    };
  }

  private buildAreaChanges(primary: Record<string, unknown>, comparison: Record<string, unknown>): Record<string, unknown> {
    const primaryWeaponTypes = Array.isArray(primary['weaponTypes']) ? (primary['weaponTypes'] as string[]) : [];
    const comparisonWeaponTypes = new Set(Array.isArray(comparison['weaponTypes']) ? (comparison['weaponTypes'] as string[]) : []);
    return {
      newTargetIds: primary['newTargetIds'] || [],
      reactivatedTargetIds: primary['reactivatedTargetIds'] || [],
      staleTargetIds: primary['staleTargetIds'] || [],
      newWeaponTypes: primaryWeaponTypes.filter((item) => !comparisonWeaponTypes.has(item)),
      newAcceptedCorrelationIds: primary['newAcceptedCorrelationIds'] || [],
    };
  }

  private dominantWeaponType(row: Record<string, unknown>): string | null {
    const entries = [
      { type: 'mortar', count: Number(row['mortar'] || 0) },
      { type: 'tube_artillery', count: Number(row['tubeArtillery'] || 0) },
      { type: 'mlrs', count: Number(row['mlrs'] || 0) },
    ].sort((left, right) => right.count - left.count);
    return entries[0].count > 0 ? entries[0].type : null;
  }

  private areaRecommendation(
    row: Record<string, unknown>,
    settings: Record<string, unknown>,
  ): { recommendation: string; reasons: string[] } {
    const thresholds = (settings['targetThresholds'] as Record<string, number> | undefined) || {};
    const high = Number(thresholds['high'] || 75);
    const medium = Number(thresholds['medium'] || 55);
    const reasons: string[] = [];
    const confidence = Number(row['avgConfidence'] || 0);
    const activity = Number(row['activityIndex'] || 0);
    const freshness = Number(row['freshnessIndex'] || 0);
    const threat = Number(row['threatIndex'] || 0);
    const accepted = Number(row['acceptedCorrelations'] || 0);
    const newTargets = Number(row['newTargets'] || 0);
    const sourceCount = Number(row['sourceCount'] || 0);

    if (confidence >= high) reasons.push(`висока довіра ${confidence}`);
    if (activity >= medium) reasons.push(`активність ${activity}`);
    if (freshness >= medium) reasons.push(`свіжість ${freshness}`);
    if (threat >= high) reasons.push(`загроза ${threat}`);
    if (accepted > 0) reasons.push(`прийняті кореляції ${accepted}`);
    if (newTargets > 0) reasons.push(`нові цілі ${newTargets}`);
    if (sourceCount >= 2) reasons.push(`незалежні джерела ${sourceCount}`);

    if ((confidence >= high && freshness >= medium && (activity >= medium || threat >= high)) || accepted > 0) {
      return { recommendation: 'puar', reasons: reasons.slice(0, 4) };
    }
    if (confidence >= medium || sourceCount <= 1) {
      return { recommendation: 'additional_recon', reasons: reasons.slice(0, 4) };
    }
    if (freshness < 25 && activity < 25 && newTargets === 0) {
      return { recommendation: 'archive', reasons: reasons.slice(0, 4) };
    }
    if (activity > 0 || Number(row['observations'] || 0) > 0) {
      return { recommendation: 'observe', reasons: reasons.slice(0, 4) };
    }
    return { recommendation: 'none', reasons: reasons.slice(0, 4) };
  }

  private buildAreaConclusion(
    primary: Record<string, unknown>,
    comparison: Record<string, unknown>,
    changes: Record<string, unknown>,
    recommendation: string,
    reasons: string[],
    dominantWeaponType: string | null,
  ): string {
    const delta = Number(primary['activityIndex'] || 0) - Number(comparison['activityIndex'] || 0);
    const direction = delta > 0 ? 'зросла' : delta < 0 ? 'знизилась' : 'не змінилася';
    const parts = [
      `Активність ${direction} на ${Math.abs(this.percentDelta(Number(primary['activityIndex'] || 0), Number(comparison['activityIndex'] || 0)))}%.`,
    ];
    if (dominantWeaponType) {
      parts.push(`Домінує тип ${dominantWeaponType}.`);
    }
    if (Array.isArray(changes['newTargetIds']) && changes['newTargetIds'].length > 0) {
      parts.push(`Нові цілі: ${changes['newTargetIds'].length}.`);
    }
    if (Array.isArray(changes['reactivatedTargetIds']) && changes['reactivatedTargetIds'].length > 0) {
      parts.push(`Реактивовані цілі: ${changes['reactivatedTargetIds'].length}.`);
    }
    if (Number(primary['acceptedCorrelations'] || 0) > 0) {
      parts.push(`Прийняті кореляції: ${primary['acceptedCorrelations']}.`);
    }
    parts.push(`Рекомендація: ${recommendation}.`);
    if (reasons.length > 0) {
      parts.push(`Причини: ${reasons.join(', ')}.`);
    }
    return parts.join(' ');
  }

  private percentDelta(primary: number, comparison: number): number {
    if (comparison === 0) return primary > 0 ? 100 : 0;
    return Math.round(((primary - comparison) / comparison) * 100);
  }

  private recommendation(target: Record<string, unknown>): string {
    const confidence = Number(target['confidenceIndex'] || 0);
    const activity = Number(target['activityIndex'] || 0);
    const freshness = Number(target['freshnessIndex'] || 0);
    const accepted = Number(target['acceptedCorrelations'] || 0);

    if (confidence >= 75 && activity >= 60 && accepted >= 1) return 'ПУАР';
    if (freshness < 35 || confidence < 45) return 'дорозвідка';
    if (activity < 30 && freshness < 20) return 'архів';
    return 'спостерігати';
  }

  private buildConclusion(
    basic: Record<string, unknown>,
    recentChanges: Record<string, unknown>,
    priorityTargets: Array<Record<string, unknown>>,
  ): string {
    const summary = (basic['summary'] as Record<string, unknown> | undefined) || {};
    const topTarget = priorityTargets[0];
    const parts = [
      `За період зафіксовано ${Number(summary['observations'] || 0)} спостережень, ${Number(summary['impacts'] || 0)} уражень і ${Number(summary['targets'] || 0)} нових цілей.`,
      `Прийнятих кореляцій: ${Number(recentChanges['acceptedCorrelations'] || 0)}.`,
    ];
    if (summary['mostActiveArea']) {
      parts.push(`Найактивніший район: ${String(summary['mostActiveArea'])}.`);
    }
    if (topTarget) {
      parts.push(
        `Пріоритетна ціль: ${String(topTarget['targetType'])}, район ${String(topTarget['area'])}, рекомендація ${String(topTarget['recommendation'])}.`,
      );
    }
    return parts.join(' ');
  }
}
