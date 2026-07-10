import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { MainScopeGuard } from '../../../auth/main-scope.guard';
import { WriteAccessGuard } from '../../../auth/write-access.guard';
import {
  CreateReconAreaDto,
  CreateReconAssessmentDto,
  CreateReconImpactDto,
  CreateReconObservationDto,
  CreateReconReportDto,
  CreateReconTargetDto,
  CreatePuarProposalDto,
  DeltaImportDto,
  ExcludeObservationDto,
  HeatmapQueryDto,
  MergeTargetsDto,
  ProcessedTargetDecisionDto,
  RecalculateCorrelationsDto,
  UpdateTargetStatusDto,
} from '../dto/recon.dto';
import { ReconAnalyticsService } from '../services/recon-analytics.service';
import { ReconCorrelationService } from '../services/recon-correlation.service';
import { ReconHeatmapService } from '../services/recon-heatmap.service';
import { ReconProcessedTargetService } from '../services/recon-processed-target.service';
import { ReconSettingsService } from '../services/recon-settings.service';
import { ReconService } from '../services/recon.service';
import { PuarProposalService } from '../services/puar-proposal.service';

@UseGuards(JwtAuthGuard, MainScopeGuard)
@Controller('recon')
export class ReconController {
  constructor(
    private readonly recon: ReconService,
    private readonly settings: ReconSettingsService,
    private readonly analytics: ReconAnalyticsService,
    private readonly correlations: ReconCorrelationService,
    private readonly heatmap: ReconHeatmapService,
    private readonly puar: PuarProposalService,
    private readonly processedTargets: ReconProcessedTargetService,
  ) {}

  @Get('settings')
  settingsAll() {
    return this.settings.getAll();
  }

  @UseGuards(WriteAccessGuard)
  @Post('settings/:key')
  upsertSetting(@Param('key') key: string, @Body() body: Record<string, unknown>) {
    return this.settings.upsert(key, body);
  }

  @Get('areas')
  areas(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.recon.listAreas(Number(limit), Number(offset));
  }

  @UseGuards(WriteAccessGuard)
  @Post('areas')
  createArea(@Body() body: CreateReconAreaDto) {
    return this.recon.createArea(body);
  }

  @Get('reports')
  reports(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.recon.listReports(Number(limit), Number(offset));
  }

  @UseGuards(WriteAccessGuard)
  @Post('reports')
  createReport(@Body() body: CreateReconReportDto) {
    return this.recon.createReport(body);
  }

  @Get('observations')
  observations(@Query() query: Record<string, string>) {
    return this.recon.listObservations({
      from: query['from'],
      to: query['to'],
      targetType: query['targetType'],
      status: query['status'],
      limit: Number(query['limit']),
      offset: Number(query['offset']),
    });
  }

  @UseGuards(WriteAccessGuard)
  @Post('observations')
  createObservation(@Body() body: CreateReconObservationDto) {
    return this.recon.createObservation(body);
  }

  @UseGuards(WriteAccessGuard)
  @Patch('observations/:id/hide')
  hideObservation(@Param('id') id: string) {
    return this.recon.hideObservation(id);
  }

  @UseGuards(WriteAccessGuard)
  @Patch('observations/:id/archive')
  archiveObservation(@Param('id') id: string) {
    return this.recon.archiveObservation(id);
  }

  @Get('impacts')
  impacts(@Query() query: Record<string, string>) {
    return this.recon.listImpacts({
      from: query['from'],
      to: query['to'],
      targetType: query['targetType'],
      status: query['status'],
      limit: Number(query['limit']),
      offset: Number(query['offset']),
    });
  }

  @UseGuards(WriteAccessGuard)
  @Post('impacts')
  createImpact(@Body() body: CreateReconImpactDto) {
    return this.recon.createImpact(body);
  }

  @UseGuards(WriteAccessGuard)
  @Post('import/preview')
  previewImport(@Body() body: DeltaImportDto) {
    return this.recon.previewImport(body);
  }

  @UseGuards(WriteAccessGuard)
  @Post('import/validate')
  validateImport(@Body() body: DeltaImportDto) {
    return this.recon.validateImport(body);
  }

  @UseGuards(WriteAccessGuard)
  @Post('import/confirm')
  confirmImport(@Body() body: DeltaImportDto) {
    return this.recon.confirmImport(body);
  }

  @Get('import/history')
  importHistory(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.recon.listImportHistory(Number(limit), Number(offset));
  }

  @Get('import/history/:batchId/errors')
  importErrors(
    @Param('batchId') batchId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.recon.listImportErrors(batchId, Number(limit), Number(offset));
  }

  @Get('import/history/:batchId/errors.csv')
  async importErrorsCsv(@Param('batchId') batchId: string, @Res() res: Response) {
    const body = await this.recon.buildImportErrorsCsv(batchId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="recon-import-errors-${batchId}.csv"`);
    res.send(body);
  }

  @Get('events')
  events() {
    return this.recon.listEvents();
  }

  @Get('targets')
  targets(@Query() query: Record<string, string>) {
    return this.recon.listTargets({
      targetType: query['targetType'],
      status: query['status'],
      limit: Number(query['limit']),
      offset: Number(query['offset']),
    });
  }

  @UseGuards(WriteAccessGuard)
  @Post('targets')
  createTarget(@Body() body: CreateReconTargetDto) {
    return this.recon.createTarget(body);
  }

  @Get('targets/:id/timeline')
  targetTimeline(@Param('id') id: string) {
    return this.recon.targetTimeline(id);
  }

  @UseGuards(WriteAccessGuard)
  @Post('targets/:id/recalculate')
  recalculateTarget(@Param('id') id: string) {
    return this.recon.recalculateTarget(id);
  }

  @UseGuards(WriteAccessGuard)
  @Post('targets/:id/merge')
  mergeTargets(@Param('id') id: string, @Body() body: MergeTargetsDto) {
    return this.recon.mergeTargets(id, body);
  }

  @UseGuards(WriteAccessGuard)
  @Post('targets/:id/exclude-observation')
  excludeObservation(@Param('id') id: string, @Body() body: ExcludeObservationDto) {
    return this.recon.excludeObservation(id, body);
  }

  @UseGuards(WriteAccessGuard)
  @Patch('targets/:id/status')
  updateTargetStatus(@Param('id') id: string, @Body() body: UpdateTargetStatusDto) {
    return this.recon.updateTargetStatus(id, body);
  }

  @Get('assessments')
  assessments() {
    return this.recon.listAssessments();
  }

  @UseGuards(WriteAccessGuard)
  @Post('assessments')
  createAssessment(@Body() body: CreateReconAssessmentDto) {
    return this.recon.createAssessment(body);
  }

  @Get('analytics/basic')
  basicAnalytics(@Query() query: Record<string, string>) {
    return this.analytics.basic(query['range'] || '24h', query['from'], query['to']);
  }

  @Get('correlations')
  listCorrelations(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.correlations.list(Number(limit), Number(offset));
  }

  @UseGuards(WriteAccessGuard)
  @Post('correlations/recalc')
  recalculateCorrelations(@Body() body: RecalculateCorrelationsDto) {
    return this.correlations.recalculate(body);
  }

  @UseGuards(WriteAccessGuard)
  @Post('correlations/:id/accept')
  acceptCorrelation(@Param('id') id: string) {
    return this.correlations.accept(id);
  }

  @UseGuards(WriteAccessGuard)
  @Post('correlations/:id/reject')
  rejectCorrelation(@Param('id') id: string) {
    return this.correlations.reject(id);
  }

  @Get('correlations/by-target/:id')
  correlationsByTarget(@Param('id') id: string) {
    return this.correlations.byTarget(id);
  }

  @Get('correlations/by-impact/:id')
  correlationsByImpact(@Param('id') id: string) {
    return this.correlations.byImpact(id);
  }

  @Get('heatmap')
  getHeatmap(@Query() query: HeatmapQueryDto) {
    return this.heatmap.get(query);
  }

  @Get('analytics')
  fullAnalytics(@Query() query: Record<string, string>) {
    return this.analytics.full(query['range'] || '24h', query['from'], query['to']);
  }

  @Get('analytics/areas')
  areaAnalytics(@Query() query: Record<string, string>) {
    return this.analytics.areas({
      primaryFrom: query['primaryFrom'],
      primaryTo: query['primaryTo'],
      compareFrom: query['compareFrom'],
      compareTo: query['compareTo'],
      includeHistorical: query['includeHistorical'] === 'true',
      targetType: query['targetType'],
      source: query['source'],
    });
  }

  @Get('reports/daily')
  dailyReport(@Query('day') day?: string) {
    return this.analytics.daily(day);
  }

  @Get('puar')
  listPuar() {
    return this.puar.list();
  }

  @UseGuards(WriteAccessGuard)
  @Post('puar')
  createPuar(@Body() body: CreatePuarProposalDto) {
    return this.puar.create(body);
  }

  @Get('puar/:id')
  getPuar(@Param('id') id: string) {
    return this.puar.findOne(id);
  }

  @Get('processed-target-decisions')
  pendingProcessedTargetDecisions() {
    return this.processedTargets.pending();
  }

  @UseGuards(WriteAccessGuard)
  @Post('targets/:id/processed-decision')
  decideProcessedTarget(
    @Param('id') id: string,
    @Body() body: ProcessedTargetDecisionDto,
  ) {
    return this.processedTargets.decide(id, body.observationId, body.decision);
  }
}
