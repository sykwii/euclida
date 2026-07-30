import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { latLngToMgrs, mgrsToLatLng } from '../../../common/geo/mgrs.util';
import {
  CreateReconAreaDto,
  CreateReconAssessmentDto,
  CreateReconImpactDto,
  CreateReconObservationDto,
  CreateReconReportDto,
  CreateReconTargetDto,
  DeltaImportDto,
  ExcludeObservationDto,
  MergeTargetsDto,
  UpdateTargetStatusDto,
} from '../dto/recon.dto';
import { TargetClusteringEngine } from '../engines/target-clustering.engine';
import { ReconEventsService } from '../events/recon-events.service';
import { RECON_SOURCES, RECON_TARGET_TYPES } from '../recon.types';
import { ReconProcessedTargetService } from './recon-processed-target.service';
import { ReconSettingsService } from './recon-settings.service';

type ImportRowStatus = 'accepted' | 'duplicate' | 'warning' | 'error' | 'skipped';

interface ParsedCsvResult {
  delimiter: ',' | ';' | '\t';
  headers: string[];
  rows: Record<string, string>[];
}

interface ImportPreviewRow {
  rowNumber: number;
  status: ImportRowStatus;
  message?: string;
  warnings?: string[];
  payload?: CreateReconObservationDto;
  normalized?: Record<string, unknown>;
  raw: Record<string, string>;
}

@Injectable()
export class ReconService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly events: ReconEventsService,
    private readonly clustering: TargetClusteringEngine,
    private readonly processedTargets: ReconProcessedTargetService,
    private readonly settings: ReconSettingsService,
  ) {}

  listAreas(limit = 200, offset = 0): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, name, status, description, ST_AsGeoJSON(geometry)::json AS geometry,
        created_at AS "createdAt", updated_at AS "updatedAt", archived_at AS "archivedAt"
       FROM recon_areas
       WHERE archived_at IS NULL
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [this.limit(limit), this.offset(offset)],
    );
  }

  async createArea(dto: CreateReconAreaDto): Promise<Record<string, unknown>> {
    const coordinates = this.closePolygon(dto.coordinates || []);
    if (coordinates.length < 4) throw new BadRequestException('Полігон має містити щонайменше 3 точки');
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_areas (name, description, geometry)
       VALUES ($1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
       RETURNING id, name, status, description, ST_AsGeoJSON(geometry)::json AS geometry, created_at AS "createdAt"`,
      [dto.name, dto.description || null, JSON.stringify({ type: 'Polygon', coordinates: [coordinates] })],
    );
    await this.events.record('recon:update', 'recon_area', row.id, { action: 'created' });
    return row;
  }

  listReports(limit = 200, offset = 0): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, title, source, input_provider AS "inputProvider", report_datetime AS "reportDatetime",
        summary, raw_payload AS "rawPayload", created_at AS "createdAt"
       FROM recon_intelligence_reports
       ORDER BY report_datetime DESC
       LIMIT $1 OFFSET $2`,
      [this.limit(limit), this.offset(offset)],
    );
  }

  async createReport(dto: CreateReconReportDto): Promise<Record<string, unknown>> {
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_intelligence_reports (title, source, input_provider, report_datetime, summary, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, title, source, input_provider AS "inputProvider", report_datetime AS "reportDatetime",
        summary, raw_payload AS "rawPayload", created_at AS "createdAt"`,
      [
        dto.title,
        dto.source,
        dto.inputProvider || 'manual',
        dto.reportDatetime || new Date().toISOString(),
        dto.summary || null,
        JSON.stringify(dto.rawPayload || {}),
      ],
    );
    await this.events.record('recon:update', 'recon_report', row.id, { action: 'created' });
    return row;
  }

  listObservations(query: { from?: string; to?: string; targetType?: string; status?: string; limit?: number; offset?: number } = {}): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT o.*, o.platform_id AS "platformId", o.external_id AS "externalId",
        o.input_provider AS "inputProvider", o.target_type AS "targetType",
        o.observation_datetime AS "observationDatetime", o.raw_payload AS "rawPayload",
        o.created_at AS "createdAt",
        tobs.target_id AS "targetId"
       FROM recon_observations o
       LEFT JOIN recon_target_observations tobs ON tobs.observation_id = o.id
       WHERE o.archived_at IS NULL
         AND ($1::timestamptz IS NULL OR o.observation_datetime >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR o.observation_datetime <= $2::timestamptz)
         AND ($3::varchar IS NULL OR o.target_type = $3)
         AND ($4::varchar IS NULL OR o.status = $4)
       ORDER BY o.observation_datetime DESC
       LIMIT $5 OFFSET $6`,
      [
        query.from || null,
        query.to || null,
        query.targetType || null,
        query.status || null,
        this.limit(query.limit),
        this.offset(query.offset),
      ],
    );
  }

  async createObservation(dto: CreateReconObservationDto): Promise<Record<string, unknown>> {
    const point = this.resolvePoint(dto);
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_observations (
        platform_id, external_id, source, input_provider, target_type, observation_datetime,
        lat, lng, mgrs, geometry, raw_payload, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_MakePoint($8, $7), 4326), $10::jsonb, $11)
       RETURNING id, platform_id AS "platformId", external_id AS "externalId", source,
        input_provider AS "inputProvider", target_type AS "targetType", observation_datetime AS "observationDatetime",
        lat, lng, mgrs, raw_payload AS "rawPayload", notes, status, created_at AS "createdAt"`,
      [
        dto.platformId || null,
        dto.externalId || null,
        dto.source,
        dto.inputProvider || 'manual',
        dto.targetType,
        dto.observationDatetime,
        point.lat,
        point.lng,
        point.mgrs,
        JSON.stringify(dto.rawPayload || {}),
        dto.notes || null,
      ],
    );
    await this.events.record('recon:observation-created', 'recon_observation', row.id, { targetType: dto.targetType });
    await this.clustering.processObservation(row.id);
    await this.queueProcessedTargetDecisions(row.id, dto.targetType, point.lat, point.lng);
    return row;
  }

  async hideObservation(id: string): Promise<void> {
    const result = await this.dataSource.query(
      `UPDATE recon_observations SET status = 'hidden', hidden_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id`,
      [id],
    );
    if (result.length === 0) throw new NotFoundException('Спостереження не знайдено');
    await this.events.record('recon:update', 'recon_observation', id, { action: 'hidden' });
  }

  async archiveObservation(id: string): Promise<void> {
    const result = await this.dataSource.query(
      `UPDATE recon_observations SET status = 'archived', archived_at = now() WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.length === 0) throw new NotFoundException('Спостереження не знайдено');
    await this.events.record('recon:update', 'recon_observation', id, { action: 'archived' });
  }

  listImpacts(query: { from?: string; to?: string; targetType?: string; status?: string; limit?: number; offset?: number } = {}): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, platform_id AS "platformId", external_id AS "externalId", source,
        input_provider AS "inputProvider", target_type AS "targetType", impact_datetime AS "impactDatetime",
        lat, lng, mgrs, raw_payload AS "rawPayload", notes, status, created_at AS "createdAt"
       FROM recon_impact_observations
       WHERE archived_at IS NULL
         AND ($1::timestamptz IS NULL OR impact_datetime >= $1::timestamptz)
         AND ($2::timestamptz IS NULL OR impact_datetime <= $2::timestamptz)
         AND ($3::varchar IS NULL OR target_type = $3)
         AND ($4::varchar IS NULL OR status = $4)
       ORDER BY impact_datetime DESC
       LIMIT $5 OFFSET $6`,
      [
        query.from || null,
        query.to || null,
        query.targetType || null,
        query.status || null,
        this.limit(query.limit),
        this.offset(query.offset),
      ],
    );
  }

  async createImpact(dto: CreateReconImpactDto): Promise<Record<string, unknown>> {
    const point = this.resolvePoint(dto);
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_impact_observations (
        platform_id, external_id, source, input_provider, target_type, impact_datetime,
        lat, lng, mgrs, geometry, raw_payload, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_MakePoint($8, $7), 4326), $10::jsonb, $11)
       RETURNING id, platform_id AS "platformId", external_id AS "externalId", source,
        input_provider AS "inputProvider", target_type AS "targetType", impact_datetime AS "impactDatetime",
        lat, lng, mgrs, raw_payload AS "rawPayload", notes, status, created_at AS "createdAt"`,
      [
        dto.platformId || null,
        dto.externalId || null,
        dto.source,
        dto.inputProvider || 'manual',
        dto.targetType,
        dto.impactDatetime,
        point.lat,
        point.lng,
        point.mgrs,
        JSON.stringify(dto.rawPayload || {}),
        dto.notes || null,
      ],
    );
    await this.events.record('recon:impact-created', 'recon_impact', row.id, { targetType: dto.targetType });
    return row;
  }

  async previewImport(dto: DeltaImportDto): Promise<Record<string, unknown>> {
    const parsedCsv = this.parseCsv(dto.csv || '');
    const mapping = this.buildImportMapping(parsedCsv.headers, dto.mapping);
    const parsed = await Promise.all(parsedCsv.rows.map((row, index) => this.validateImportRow(row, index + 2, dto, mapping)));

    return {
      filename: dto.filename || null,
      delimiter: parsedCsv.delimiter,
      columns: parsedCsv.headers,
      mapping,
      totalRows: parsedCsv.rows.length,
      acceptedRows: parsed.filter((row) => row.status === 'accepted').length,
      duplicateRows: parsed.filter((row) => row.status === 'duplicate').length,
      warningRows: parsed.filter((row) => row.status === 'warning').length,
      errorRows: parsed.filter((row) => row.status === 'error').length,
      skippedRows: parsed.filter((row) => row.status === 'skipped').length,
      sampleRows: parsedCsv.rows.slice(0, 5),
      rows: parsed,
    };
  }

  validateImport(dto: DeltaImportDto): Promise<Record<string, unknown>> {
    return this.previewImport(dto);
  }

  async confirmImport(dto: DeltaImportDto): Promise<Record<string, unknown>> {
    const preview = await this.previewImport(dto);
    const rows = (preview['rows'] as ImportPreviewRow[]) || [];
    const duplicateStrategy = dto.duplicateStrategy || 'skip';

    if (duplicateStrategy === 'cancel' && Number(preview['duplicateRows'] || 0) > 0) {
      throw new BadRequestException('Виявлено дублікати. Змініть стратегію імпорту або очистьте CSV.');
    }

    if (duplicateStrategy === 'update-preview' && Number(preview['duplicateRows'] || 0) > 0) {
      return {
        ...preview,
        importedRows: 0,
        blockedByDuplicates: true,
        message: 'Імпорт зупинено до розв’язання дублікатів.',
      };
    }

    const acceptedRows = rows.filter((row) => row.status === 'accepted' && row.payload);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const importSource = this.normalizeReconSource(dto.source) || 'light_recon';
      const [report] = await queryRunner.query(
        `INSERT INTO recon_intelligence_reports (title, source, input_provider, report_datetime, summary, raw_payload)
         VALUES ($1, $2, 'delta_import', now(), $3, $4::jsonb)
         RETURNING id, title`,
        [
          dto.filename || `Delta CSV ${new Date().toISOString()}`,
          importSource,
          'CSV delta import',
          JSON.stringify({
            filename: dto.filename || null,
            mapping: preview['mapping'] || {},
            columns: preview['columns'] || [],
          }),
        ],
      );

      const [batch] = await queryRunner.query(
        `INSERT INTO recon_import_batches (source, status, total_rows, accepted_rows, duplicate_rows, error_rows, raw_payload, confirmed_at)
         VALUES ('delta_import', 'confirmed', $1, $2, $3, $4, $5::jsonb, now())
         RETURNING id, confirmed_at AS "confirmedAt"`,
        [
          preview['totalRows'],
          acceptedRows.length,
          preview['duplicateRows'],
          Number(preview['errorRows'] || 0) + Number(preview['warningRows'] || 0) + Number(preview['skippedRows'] || 0),
          JSON.stringify({
            filename: dto.filename || null,
            reportId: report.id,
            preview,
          }),
        ],
      );

      const createdRows: Array<Record<string, unknown>> = [];

      for (const row of rows) {
        if (row.status === 'accepted' && row.payload) {
          const point = this.resolvePoint(row.payload);
          const [created] = await queryRunner.query(
            `INSERT INTO recon_observations (
              platform_id, external_id, source, input_provider, target_type, observation_datetime,
              lat, lng, mgrs, geometry, raw_payload, notes
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ST_SetSRID(ST_MakePoint($8, $7), 4326), $10::jsonb, $11)
             RETURNING id, platform_id AS "platformId", external_id AS "externalId", source,
              input_provider AS "inputProvider", target_type AS "targetType", observation_datetime AS "observationDatetime",
              lat, lng, mgrs, raw_payload AS "rawPayload", notes, status, created_at AS "createdAt"`,
            [
              row.payload.platformId || null,
              row.payload.externalId || null,
              row.payload.source,
              row.payload.inputProvider || 'delta_import',
              row.payload.targetType,
              row.payload.observationDatetime,
              point.lat,
              point.lng,
              point.mgrs,
              JSON.stringify(row.payload.rawPayload || {}),
              row.payload.notes || null,
            ],
          );
          createdRows.push(created);
          continue;
        }

        await queryRunner.query(
          `INSERT INTO recon_import_errors (batch_id, row_number, error_code, message, raw_payload)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            batch.id,
            row.rowNumber,
            row.status,
            String(row.message || row.status),
            JSON.stringify({
              warnings: row.warnings || [],
              normalized: row.normalized || null,
              raw: row.raw,
            }),
          ],
        );
      }

      await queryRunner.commitTransaction();

      void this.postImportProcessing(batch.id, createdRows).catch(() => undefined);

      return {
        ...preview,
        batchId: batch.id,
        reportId: report.id,
        importedRows: createdRows.length,
        skippedRows:
          Number(preview['duplicateRows'] || 0) +
          Number(preview['warningRows'] || 0) +
          Number(preview['errorRows'] || 0) +
          Number(preview['skippedRows'] || 0),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  listImportHistory(limit = 50, offset = 0): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, source, status, total_rows AS "totalRows", accepted_rows AS "acceptedRows",
        duplicate_rows AS "duplicateRows", error_rows AS "errorRows", raw_payload AS "rawPayload",
        created_at AS "createdAt", confirmed_at AS "confirmedAt"
       FROM recon_import_batches
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [this.limit(limit), this.offset(offset)],
    );
  }

  async listImportErrors(batchId: string, limit = 200, offset = 0): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, batch_id AS "batchId", row_number AS "rowNumber", error_code AS "errorCode",
        message, raw_payload AS "rawPayload", created_at AS "createdAt"
       FROM recon_import_errors
       WHERE batch_id = $1
       ORDER BY row_number ASC, created_at ASC
       LIMIT $2 OFFSET $3`,
      [batchId, this.limit(limit), this.offset(offset)],
    );
  }

  async buildImportErrorsCsv(batchId: string, limit = 5000): Promise<string> {
    const rows = await this.dataSource.query(
      `SELECT row_number AS "rowNumber", error_code AS "errorCode", message, raw_payload AS "rawPayload"
       FROM recon_import_errors
       WHERE batch_id = $1
       ORDER BY row_number ASC, created_at ASC
       LIMIT $2`,
      [batchId, this.csvLimit(limit)],
    );

    const header = ['rowNumber', 'errorCode', 'message', 'warnings', 'normalized', 'raw'];
    const body = rows.map((row: Record<string, unknown>) => {
      const rawPayload = (row['rawPayload'] as Record<string, unknown> | null) || {};
      const warnings = Array.isArray(rawPayload['warnings']) ? rawPayload['warnings'] : [];
      return [
        row['rowNumber'],
        row['errorCode'],
        row['message'],
        JSON.stringify(warnings),
        JSON.stringify(rawPayload['normalized'] || null),
        JSON.stringify(rawPayload['raw'] || rawPayload),
      ]
        .map((value) => this.csvCell(value))
        .join(',');
    });

    return `\uFEFF${header.join(',')}\n${body.join('\n')}`;
  }

  listEvents(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, event_type AS "eventType", entity_type AS "entityType", entity_id AS "entityId",
        payload, created_at AS "createdAt"
       FROM recon_events
       ORDER BY created_at DESC
       LIMIT 200`,
    );
  }

  listTargets(query: { targetType?: string; status?: string; limit?: number; offset?: number } = {}): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, platform_id AS "platformId", target_type AS "targetType", possible_target_types AS "possibleTargetTypes",
        status, lat, lng, mgrs, semi_major_m AS "semiMajorM", semi_minor_m AS "semiMinorM", azimuth_deg AS "azimuthDeg",
        confidence_index AS "confidenceIndex", confidence_label AS "confidenceLabel", activity_index AS "activityIndex",
        freshness_index AS "freshnessIndex", threat_index AS "threatIndex", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM recon_targets
       WHERE archived_at IS NULL
         AND ($1::varchar IS NULL OR target_type = $1)
         AND ($2::varchar IS NULL OR status = $2)
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [
        query.targetType || null,
        query.status || null,
        this.limit(query.limit),
        this.offset(query.offset),
      ],
    );
  }

  async createTarget(dto: CreateReconTargetDto): Promise<Record<string, unknown>> {
    let point = this.resolvePoint(dto);
    if (dto.observationId) {
      const [observation] = await this.dataSource.query(`SELECT lat, lng, mgrs, target_type AS "targetType" FROM recon_observations WHERE id = $1`, [dto.observationId]);
      if (!observation) throw new NotFoundException('Спостереження не знайдено');
      point = { lat: Number(observation.lat), lng: Number(observation.lng), mgrs: observation.mgrs };
      dto.targetType = dto.targetType || observation.targetType;
    }
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_targets (platform_id, target_type, possible_target_types, status, center, lat, lng, mgrs)
       VALUES ($1, $2, $3::jsonb, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326), $5, $6, $7)
       RETURNING id, platform_id AS "platformId", target_type AS "targetType", status, lat, lng, mgrs, created_at AS "createdAt"`,
      [
        dto.platformId || null,
        dto.targetType,
        JSON.stringify(dto.possibleTargetTypes || [dto.targetType]),
        dto.status || 'candidate',
        point.lat,
        point.lng,
        point.mgrs,
      ],
    );
    if (dto.observationId) {
      await this.dataSource.query(
        `INSERT INTO recon_target_observations (target_id, observation_id, link_type)
         VALUES ($1, $2, 'manual') ON CONFLICT DO NOTHING`,
        [row.id, dto.observationId],
      );
    }
    await this.recalculateTarget(row.id);
    await this.events.record('recon:target-created', 'recon_target', row.id, { action: 'manual' });
    return row;
  }

  async targetTimeline(id: string): Promise<Record<string, unknown>> {
    const observations = await this.dataSource.query(
      `SELECT o.id, o.source, o.target_type AS "targetType", o.observation_datetime AS "at", o.lat, o.lng, 'observation' AS kind
       FROM recon_observations o
       JOIN recon_target_observations link ON link.observation_id = o.id
       WHERE link.target_id = $1
       ORDER BY o.observation_datetime DESC`,
      [id],
    );
    const assessments = await this.dataSource.query(
      `SELECT id, assessment_type AS "assessmentType", status, created_at AS "at", 'assessment' AS kind
       FROM recon_assessments
       WHERE target_id = $1
       ORDER BY created_at DESC`,
      [id],
    );
    return { targetId: id, items: [...observations, ...assessments].sort((a, b) => String(b.at).localeCompare(String(a.at))) };
  }

  async recalculateTarget(id: string): Promise<void> {
    const observations = await this.dataSource.query(
      `SELECT o.source, o.target_type AS "targetType", o.observation_datetime AS "observationDatetime"
       FROM recon_observations o
       JOIN recon_target_observations link ON link.observation_id = o.id
       WHERE link.target_id = $1`,
      [id],
    );
    const [target] = await this.dataSource.query(`SELECT target_type AS "targetType" FROM recon_targets WHERE id = $1`, [id]);
    if (!target) throw new NotFoundException('Ціль не знайдено');
    const indexes = this.clustering.indexes(target.targetType, observations);
    await this.dataSource.query(
      `UPDATE recon_targets
       SET confidence_index = $2, confidence_label = $3, activity_index = $4, freshness_index = $5, threat_index = $6, updated_at = now()
       WHERE id = $1`,
      [id, indexes.confidenceIndex, indexes.confidenceLabel, indexes.activityIndex, indexes.freshnessIndex, indexes.threatIndex],
    );
    await this.events.record('recon:analytics-updated', 'recon_target', id, indexes);
  }

  async mergeTargets(id: string, dto: MergeTargetsDto): Promise<void> {
    const ids = Array.from(new Set([id, ...(dto.targetIds || [])])).filter(Boolean);
    await this.dataSource.query(`UPDATE recon_target_observations SET target_id = $1 WHERE target_id = ANY($2::uuid[])`, [id, ids.filter((item) => item !== id)]);
    await this.dataSource.query(`UPDATE recon_targets SET archived_at = now(), status = 'processed' WHERE id = ANY($1::uuid[]) AND id <> $2`, [ids, id]);
    await this.recalculateTarget(id);
    await this.events.record('recon:target-updated', 'recon_target', id, { action: 'merged', sourceTargetIds: ids });
  }

  async excludeObservation(id: string, dto: ExcludeObservationDto): Promise<void> {
    await this.dataSource.query(`DELETE FROM recon_target_observations WHERE target_id = $1 AND observation_id = $2`, [id, dto.observationId]);
    await this.recalculateTarget(id);
    await this.events.record('recon:target-updated', 'recon_target', id, { action: 'observation_excluded', observationId: dto.observationId });
  }

  async updateTargetStatus(id: string, dto: UpdateTargetStatusDto): Promise<void> {
    await this.dataSource.query(`UPDATE recon_targets SET status = $2, updated_at = now() WHERE id = $1`, [id, dto.status]);
    await this.events.record('recon:target-status-changed', 'recon_target', id, { status: dto.status });
  }

  listAssessments(): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, target_id AS "targetId", proposed_by AS "proposedBy", confirmed_by AS "confirmedBy",
        status, assessment_type AS "assessmentType", notes, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM recon_assessments
       ORDER BY created_at DESC`,
    );
  }

  async createAssessment(dto: CreateReconAssessmentDto): Promise<Record<string, unknown>> {
    const [row] = await this.dataSource.query(
      `INSERT INTO recon_assessments (target_id, proposed_by, confirmed_by, status, assessment_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, target_id AS "targetId", proposed_by AS "proposedBy", confirmed_by AS "confirmedBy",
        status, assessment_type AS "assessmentType", notes, created_at AS "createdAt"`,
      [
        dto.targetId || null,
        dto.proposedBy || null,
        dto.confirmedBy || null,
        dto.status || 'proposed',
        dto.assessmentType || 'no_assessment',
        dto.notes || null,
      ],
    );
    await this.events.record('recon:update', 'recon_assessment', row.id, { targetId: dto.targetId });
    return row;
  }

  private resolvePoint(dto: { lat?: number; lng?: number; mgrs?: string }): { lat: number; lng: number; mgrs: string } {
    if (typeof dto.lat === 'number' && typeof dto.lng === 'number') {
      return { lat: dto.lat, lng: dto.lng, mgrs: dto.mgrs || latLngToMgrs(dto.lat, dto.lng) };
    }
    if (dto.mgrs) {
      const point = mgrsToLatLng(dto.mgrs);
      return { ...point, mgrs: dto.mgrs };
    }
    throw new BadRequestException('Вкажіть координати або MGRS');
  }

  private closePolygon(coordinates: [number, number][]): [number, number][] {
    const clean = coordinates.filter((point) => Array.isArray(point) && point.length === 2);
    if (clean.length === 0) return clean;
    const first = clean[0];
    const last = clean[clean.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) clean.push(first);
    return clean;
  }

  private parseCsv(csv: string): ParsedCsvResult {
    const normalized = (csv || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => this.unwrapQuotedCsvLine(line))
      .join('\n');
    if (!normalized.trim()) {
      return { delimiter: ',', headers: [], rows: [] };
    }

    const delimiter = this.detectDelimiter(normalized);
    const matrix = this.parseDelimitedRows(normalized, delimiter).filter((row) => row.some((cell) => cell.trim() !== ''));
    if (matrix.length > 5_001) {
      throw new BadRequestException('CSV містить більше 5000 рядків');
    }
    if (matrix.length < 2) {
      return { delimiter, headers: matrix[0]?.map((item) => item.trim()) || [], rows: [] };
    }

    const headers = matrix[0].map((item, index) => this.ensureHeader(item, index));
    const rows = matrix.slice(1).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, (values[index] || '').trim()])),
    );

    return { delimiter, headers, rows };
  }

  private unwrapQuotedCsvLine(line: string): string {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) return line;
    if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return line;
    const body = trimmed.slice(1, -1);
    if (!body.includes('""')) return line;
    return body.replace(/""/g, '"');
  }

  private detectDelimiter(csv: string): ',' | ';' | '\t' {
    const firstLine = csv.split('\n').find((line) => line.trim()) || '';
    const variants: Array<',' | ';' | '\t'> = [',', ';', '\t'];
    return variants.reduce((best, delimiter) => {
      const bestCount = firstLine.split(best).length;
      const nextCount = firstLine.split(delimiter).length;
      return nextCount > bestCount ? delimiter : best;
    }, ',');
  }

  private parseDelimitedRows(csv: string, delimiter: ',' | ';' | '\t'): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let current = '';
    let quoted = false;

    for (let index = 0; index < csv.length; index += 1) {
      const char = csv[index];
      const next = csv[index + 1];

      if (char === '"') {
        if (quoted && next === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
        continue;
      }

      if (char === delimiter && !quoted) {
        row.push(current);
        current = '';
        continue;
      }

      if (char === '\n' && !quoted) {
        row.push(current);
        rows.push(row);
        row = [];
        current = '';
        continue;
      }

      current += char;
    }

    row.push(current);
    rows.push(row);
    return rows;
  }

  private ensureHeader(value: string, index: number): string {
    return value.trim() || `column_${index + 1}`;
  }

  private buildImportMapping(headers: string[], mapping?: Record<string, string>): Record<string, string> {
    const normalizedHeaders = new Map(headers.map((header) => [this.normalizeHeader(header), header]));
    const defaults: Record<string, string[]> = {
      externalId: ['id', 'externalid', 'external_id'],
      observationDatetime: ['observation_datetime', 'observationdatetime', 'time', 'datetime', 'date_time'],
      coordinates: ['coordinates', 'coord', 'point'],
      lat: ['lat', 'latitude'],
      lng: ['lng', 'lon', 'long', 'longitude'],
      mgrs: ['mgrs'],
      sidc: ['sidc'],
      name: ['name', 'target_name'],
      platformType: ['platform_type', 'platformtype', 'platform'],
      source: ['source'],
      staffComments: ['staff_comments', 'staffcomments', 'comments', 'notes'],
      reliabilityCredibility: ['reliability_credibility', 'reliabilitycredibility', 'reliability'],
      direction: ['direction'],
      speed: ['speed'],
    };

    const resolved: Record<string, string> = {};
    for (const [field, aliases] of Object.entries(defaults)) {
      const explicit = mapping?.[field];
      if (explicit && headers.includes(explicit)) {
        resolved[field] = explicit;
        continue;
      }

      const header = aliases.map((alias) => normalizedHeaders.get(alias)).find(Boolean);
      if (header) resolved[field] = header;
    }

    for (let index = 1; index <= 20; index += 1) {
      const key = `comment${index}`;
      const explicit = mapping?.[key];
      if (explicit && headers.includes(explicit)) {
        resolved[key] = explicit;
        continue;
      }
      const header = normalizedHeaders.get(key) || normalizedHeaders.get(`comment_${index}`);
      if (header) resolved[key] = header;
    }

    return resolved;
  }

  private normalizeHeader(value: string): string {
    return (value || '')
      .trim()
      .toLowerCase()
      .replace(/^\uFEFF/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private async validateImportRow(
    row: Record<string, string>,
    rowNumber: number,
    dto: DeltaImportDto,
    mapping: Record<string, string>,
  ): Promise<ImportPreviewRow> {
    const warnings: string[] = [];
    const rowContext = this.composeRawRowContext(row);
    const source =
      this.normalizeReconSource(this.getMappedValue(row, mapping, 'source') || this.detectSourceFromRowContext(rowContext) || dto.source) ||
      dto.source ||
      'light_recon';
    const targetType = this.detectTargetType(row, mapping, rowContext) || dto.targetTypeOverride || null;
    const observationDatetime =
      this.parseObservationDatetime(this.getMappedValue(row, mapping, 'observationDatetime')) ||
      this.extractObservationDatetime(row, mapping, rowContext);
    const coordinates = this.parseCoordinates(row, mapping, rowContext);
    const notes = this.composeImportComments(row, mapping);
    const externalId = this.getMappedValue(row, mapping, 'externalId') || this.extractExternalId(row, mapping, rowContext);
    const reliability = this.normalizeReliability(this.getMappedValue(row, mapping, 'reliabilityCredibility'));

    if (!RECON_SOURCES.includes(source as never)) {
      return { rowNumber, status: 'error', message: '\u041d\u0435\u0432\u0456\u0434\u043e\u043c\u0435 \u0434\u0436\u0435\u0440\u0435\u043b\u043e \u0456\u043c\u043f\u043e\u0440\u0442\u0443', raw: row };
    }
    if (!targetType) {
      return { rowNumber, status: 'warning', message: '\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0432\u0438\u0437\u043d\u0430\u0447\u0438\u0442\u0438 \u0442\u0438\u043f \u0446\u0456\u043b\u0456', raw: row };
    }
    if (!observationDatetime) {
      return { rowNumber, status: 'error', message: '\u041d\u0435\u043a\u043e\u0440\u0435\u043a\u0442\u043d\u0438\u0439 \u0447\u0430\u0441 \u0441\u043f\u043e\u0441\u0442\u0435\u0440\u0435\u0436\u0435\u043d\u043d\u044f', raw: row };
    }
    if (!coordinates) {
      return { rowNumber, status: 'error', message: '\u041d\u0435\u043a\u043e\u0440\u0435\u043a\u0442\u043d\u0456 \u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0442\u0438 \u0430\u0431\u043e MGRS', raw: row };
    }
    if (!reliability) {
      warnings.push('\u041d\u0435\u043c\u0430\u0454 \u043c\u0430\u043f\u0456\u043d\u0433\u0443 reliability/credibility');
    }

    const payload: CreateReconObservationDto = {
      externalId: externalId || undefined,
      source,
      inputProvider: 'delta_import',
      targetType,
      observationDatetime,
      lat: coordinates.lat,
      lng: coordinates.lng,
      mgrs: coordinates.mgrs,
      notes: notes || undefined,
      rawPayload: row,
    };

    const duplicate = await this.isDuplicate(payload);
    return {
      rowNumber,
      status: duplicate ? 'duplicate' : 'accepted',
      message: duplicate ? '\u0414\u0443\u0431\u043b\u0456\u043a\u0430\u0442 \u0441\u043f\u043e\u0441\u0442\u0435\u0440\u0435\u0436\u0435\u043d\u043d\u044f' : undefined,
      warnings,
      payload,
      normalized: {
        externalId: payload.externalId || null,
        source,
        targetType,
        observationDatetime,
        lat: coordinates.lat,
        lng: coordinates.lng,
        mgrs: coordinates.mgrs,
        reliability,
        notes: notes || null,
      },
      raw: row,
    };
  }

  private getMappedValue(row: Record<string, string>, mapping: Record<string, string>, field: string): string {
    const header = mapping[field];
    return header ? String(row[header] || '').trim() : '';
  }

  private detectTargetType(
    row: Record<string, string>,
    mapping: Record<string, string>,
    rowContext = '',
  ): CreateReconObservationDto['targetType'] | null {
    const value = [
      this.getMappedValue(row, mapping, 'sidc'),
      this.getMappedValue(row, mapping, 'name'),
      this.getMappedValue(row, mapping, 'platformType'),
      this.getMappedValue(row, mapping, 'staffComments'),
      ...Array.from({ length: 20 }, (_, index) => this.getMappedValue(row, mapping, `comment${index + 1}`)),
      rowContext,
    ]
      .join(' ')
      .toLowerCase();

    if (!value) return null;
    if (/(type\s*:\s*mortar|subtype\s*:\s*heavy|cbrr|мін|mortar|82mm|120mm|81mm|60mm)/i.test(value)) return 'mortar';
    if (/(type\s*:\s*arty|ствол|artillery|howitzer|152mm|155mm|122mm|d30|m777|fh70|2a65|2s3|2s19)/i.test(value)) return 'tube_artillery';
    if (/(mlrs|grad|smerch|uragan|himars|bm-21|bm21|tornado)/i.test(value)) return 'mlrs';
    return null;
  }

  private composeImportComments(row: Record<string, string>, mapping: Record<string, string>): string {
    const parts: string[] = [];
    const staff = this.getMappedValue(row, mapping, 'staffComments');
    if (staff) parts.push(staff);
    for (let index = 1; index <= 20; index += 1) {
      const value = this.getMappedValue(row, mapping, `comment${index}`);
      if (value) parts.push(value);
    }
    return parts.join('\n');
  }

  private normalizeReliability(value: string): string | null {
    const normalized = (value || '').trim().toUpperCase();
    if (!normalized) return null;
    if (['A1', 'A2', 'B1', 'CONFIRMED', 'HIGH'].includes(normalized)) return 'confirmed';
    if (['B2', 'C1', 'C2', 'MEDIUM'].includes(normalized)) return 'medium';
    if (['D1', 'D2', 'LOW'].includes(normalized)) return 'low';
    return null;
  }

  private parseObservationDatetime(value: string): string | null {
    const input = (value || '').trim();
    if (!input) return null;
    if (/[zZ]|[+-]\d{2}:\d{2}$/.test(input)) {
      const direct = new Date(input);
      return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
    }

    const normalized = input.replace(/\//g, '.').replace('T', ' ').replace(/\s+/g, ' ');
    const match =
      normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/) ||
      normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);

    if (!match) {
      const fallback = new Date(input);
      return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
    }

    const year = match[1].length === 4 ? Number(match[1]) : Number(match[3]);
    const month = Number(match[2]);
    const day = match[1].length === 4 ? Number(match[3]) : Number(match[1]);
    const hour = Number(match[4] || 0);
    const minute = Number(match[5] || 0);
    const second = Number(match[6] || 0);
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetMinutes = this.kyivOffsetMinutes(new Date(utcGuess));
    return new Date(utcGuess - offsetMinutes * 60000).toISOString();
  }

  private extractObservationDatetime(
    row: Record<string, string>,
    mapping: Record<string, string>,
    rowContext: string,
  ): string | null {
    const candidates = [
      this.getMappedValue(row, mapping, 'observationDatetime'),
      this.getMappedValue(row, mapping, 'quantity'),
      ...Object.values(row),
      rowContext,
    ]
      .flatMap((value) => this.extractIsoLikeDatetimes(String(value || '')))
      .filter(Boolean);

    for (const candidate of candidates) {
      const parsed = this.parseObservationDatetime(candidate);
      if (parsed) return parsed;
    }

    const dtgMatch = rowContext.match(/\bDTG:(\d{2})(\d{2})(\d{2})Z\b/i);
    if (dtgMatch) {
      const base = this.extractFirstCalendarDate(rowContext);
      if (base) {
        const resolved = new Date(Date.UTC(base.year, base.month - 1, base.day, Number(dtgMatch[2]), Number(dtgMatch[3]), 0));
        return resolved.toISOString();
      }
    }

    return null;
  }

  private kyivOffsetMinutes(date: Date): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Kiev',
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    });
    const part = formatter.formatToParts(date).find((item) => item.type === 'timeZoneName')?.value || 'GMT+2';
    const match = part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return 120;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
  }

  private parseCoordinates(
    row: Record<string, string>,
    mapping: Record<string, string>,
    rowContext = '',
  ): { lat: number; lng: number; mgrs: string } | null {
    const mgrsValue = this.getMappedValue(row, mapping, 'mgrs');
    if (mgrsValue) {
      try {
        const point = mgrsToLatLng(mgrsValue.replace(/\s+/g, '').toUpperCase());
        return { ...point, mgrs: mgrsValue };
      } catch {
        return null;
      }
    }

    const lat = this.parseCoordinateNumber(this.getMappedValue(row, mapping, 'lat'));
    const lng = this.parseCoordinateNumber(this.getMappedValue(row, mapping, 'lng'));
    if (Number.isFinite(lat) && Number.isFinite(lng) && this.isValidCoordinate(lat as number, lng as number)) {
      return { lat: lat as number, lng: lng as number, mgrs: latLngToMgrs(lat as number, lng as number) };
    }

    const coordinateCandidates = [
      this.getMappedValue(row, mapping, 'coordinates'),
      ...Array.from({ length: 20 }, (_, index) => this.getMappedValue(row, mapping, `comment${index + 1}`)),
      rowContext,
    ].filter(Boolean);

    for (const candidate of coordinateCandidates) {
      const parsed = this.parseCoordinateCandidate(candidate);
      if (parsed) return parsed;
    }

    return null;
  }

  private parseCoordinateNumber(value: string): number | null {
    const normalized = (value || '').trim().replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private isValidCoordinate(lat: number, lng: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  }

  private normalizeReconSource(value?: string | null): CreateReconObservationDto['source'] | null {
    const source = String(value || '').trim().toLowerCase();
    if (!source) return null;
    if ((RECON_SOURCES as string[]).includes(source)) return source as CreateReconObservationDto['source'];
    if (source.includes('sound')) return 'sound_recon';
    if (source.includes('counter')) return 'counter_battery_complex';
    if (source.includes('allied')) return 'allied_air_recon';
    if (source.includes('air')) return 'air_recon';
    if (source.includes('light')) return 'light_recon';
    return null;
  }

  private detectSourceFromRowContext(rowContext: string): CreateReconObservationDto['source'] | null {
    const normalized = rowContext.toLowerCase();
    if (normalized.includes('cbrr') || normalized.includes('counter')) return 'counter_battery_complex';
    if (normalized.includes('sorng') || normalized.includes('sound')) return 'sound_recon';
    if (normalized.includes('air')) return 'air_recon';
    if (normalized.includes('allied')) return 'allied_air_recon';
    if (normalized.includes('flrng') || normalized.includes('light')) return 'light_recon';
    return null;
  }

  private composeRawRowContext(row: Record<string, string>): string {
    return Object.values(row)
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' | ');
  }

  private extractExternalId(row: Record<string, string>, mapping: Record<string, string>, rowContext: string): string {
    const candidates = [
      this.getMappedValue(row, mapping, 'id'),
      this.getMappedValue(row, mapping, 'externalId'),
      ...Object.values(row),
      rowContext,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean);

    for (const candidate of candidates) {
      const token = candidate.match(/\b[А-ЯA-Z]{1,4}\d{6,}\b/u)?.[0];
      if (token) return token;
    }

    return '';
  }

  private extractIsoLikeDatetimes(value: string): string[] {
    return [...value.matchAll(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\b/g)].map((match) => match[0]);
  }

  private extractFirstCalendarDate(value: string): { year: number; month: number; day: number } | null {
    const match = value.match(/\b(202\d)-(\d{2})-(\d{2})\b/);
    if (!match) return null;
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
    };
  }

  private parseCoordinateCandidate(value: string): { lat: number; lng: number; mgrs: string } | null {
    const normalized = String(value || '')
      .replace(/[;]/g, ',')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return null;

    const wktPoint = normalized.match(/POINT\s*\(\s*(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s*\)/i);
    if (wktPoint) {
      const lngFromWkt = this.parseCoordinateNumber(wktPoint[1]);
      const latFromWkt = this.parseCoordinateNumber(wktPoint[2]);
      if (Number.isFinite(latFromWkt) && Number.isFinite(lngFromWkt) && this.isValidCoordinate(latFromWkt as number, lngFromWkt as number)) {
        return {
          lat: latFromWkt as number,
          lng: lngFromWkt as number,
          mgrs: latLngToMgrs(latFromWkt as number, lngFromWkt as number),
        };
      }
    }

    const lineString = normalized.match(/LINESTRING\s*\(\s*(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)/i);
    if (lineString) {
      const lngFromLine = this.parseCoordinateNumber(lineString[1]);
      const latFromLine = this.parseCoordinateNumber(lineString[2]);
      if (Number.isFinite(latFromLine) && Number.isFinite(lngFromLine) && this.isValidCoordinate(latFromLine as number, lngFromLine as number)) {
        return {
          lat: latFromLine as number,
          lng: lngFromLine as number,
          mgrs: latLngToMgrs(latFromLine as number, lngFromLine as number),
        };
      }
    }

    if (/^[0-9]{1,2}[A-Z]{3}/i.test(normalized.replace(/\s+/g, ''))) {
      try {
        const point = mgrsToLatLng(normalized.replace(/\s+/g, '').toUpperCase());
        return { ...point, mgrs: normalized };
      } catch {
        return null;
      }
    }

    const parts = normalized.split(/[ ,]+/).filter(Boolean);
    if (parts.length < 2) return null;

    const first = this.parseCoordinateNumber(parts[0]);
    const second = this.parseCoordinateNumber(parts[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

    if (this.isValidCoordinate(first as number, second as number)) {
      return { lat: first as number, lng: second as number, mgrs: latLngToMgrs(first as number, second as number) };
    }

    if (this.isValidCoordinate(second as number, first as number)) {
      return { lat: second as number, lng: first as number, mgrs: latLngToMgrs(second as number, first as number) };
    }

    return null;
  }

  private async postImportProcessing(batchId: string, rows: Array<Record<string, unknown>>): Promise<void> {
    for (const chunk of this.chunk(rows, 50)) {
      for (const row of chunk) {
        await this.events.record('recon:observation-created', 'recon_observation', String(row.id), {
          targetType: row['targetType'],
          inputProvider: 'delta_import',
        });
        await this.clustering.processObservation(String(row.id));
        await this.queueProcessedTargetDecisions(
          String(row.id),
          String(row['targetType']),
          Number(row['lat']),
          Number(row['lng']),
        );
      }
    }
    await this.events.record('recon:update', 'recon_import_batch', batchId, { action: 'confirmed' });
  }

  private async isDuplicate(payload: CreateReconObservationDto): Promise<boolean> {
    const duplicateByExternal = payload.externalId
      ? await this.dataSource.query(
          `SELECT id FROM recon_observations WHERE external_id = $1 AND observation_datetime = $2::timestamptz LIMIT 1`,
          [payload.externalId, payload.observationDatetime],
        )
      : [];
    if (duplicateByExternal.length > 0) return true;
    if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return false;
    const fallback = await this.dataSource.query(
      `SELECT id FROM recon_observations
       WHERE target_type = $1
         AND abs(extract(epoch from (observation_datetime - $2::timestamptz))) <= 60
         AND abs(lat - $3) < 0.00001
         AND abs(lng - $4) < 0.00001
       LIMIT 1`,
      [payload.targetType, payload.observationDatetime, payload.lat, payload.lng],
    );
    return fallback.length > 0;
  }

  private async queueProcessedTargetDecisions(observationId: string, targetType: string, lat: number, lng: number): Promise<void> {
    const radius = await this.settings.clusteringRadius(targetType);
    const targets = await this.dataSource.query(
      `SELECT id FROM recon_targets
       WHERE status = 'processed'
         AND target_type = $1
         AND ST_DWithin(center::geography, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)
       ORDER BY updated_at DESC
       LIMIT 20`,
      [targetType, lat, lng, radius],
    );
    for (const target of targets) {
      await this.processedTargets.createPendingIfNeeded(target.id, observationId);
    }
  }

  private limit(value?: number): number {
    return Math.max(1, Math.min(1000, Number(value) || 200));
  }

  private offset(value?: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
  }

  private csvLimit(value?: number): number {
    return Math.max(1, Math.min(10000, Number(value) || 5000));
  }

  private csvCell(value: unknown): string {
    const text = String(value ?? '').replace(/\r?\n/g, ' ');
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    if (items.length === 0) return [];
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
