import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../../realtime/realtime.module';
import { ReconController } from './controllers/recon.controller';
import { ActivityIndexEngine } from './engines/activity-index.engine';
import { AreaComparisonEngine } from './engines/area-comparison.engine';
import { ConfidenceEngine } from './engines/confidence.engine';
import { CorrelationEngine } from './engines/correlation.engine';
import { FreshnessEngine } from './engines/freshness.engine';
import { HeatmapEngine } from './engines/heatmap.engine';
import { DailyReportEngine } from './engines/daily-report.engine';
import { TargetClusteringEngine } from './engines/target-clustering.engine';
import { ThreatIndexEngine } from './engines/threat-index.engine';
import { ReconArea } from './entities/recon-area.entity';
import { ReconAssessment } from './entities/recon-assessment.entity';
import { ReconCorrelation } from './entities/recon-correlation.entity';
import { ReconEvent } from './entities/recon-event.entity';
import { ReconImpactObservation } from './entities/recon-impact-observation.entity';
import { ReconImportBatch } from './entities/recon-import-batch.entity';
import { ReconImportError } from './entities/recon-import-error.entity';
import { ReconIntelligenceReport } from './entities/recon-intelligence-report.entity';
import { ReconObservation } from './entities/recon-observation.entity';
import { ReconPuarProposal } from './entities/recon-puar-proposal.entity';
import { ReconProcessedTargetDecision } from './entities/recon-processed-target-decision.entity';
import { ReconSetting } from './entities/recon-setting.entity';
import { ReconTarget } from './entities/recon-target.entity';
import { ReconTargetObservation } from './entities/recon-target-observation.entity';
import { ReconEventsService } from './events/recon-events.service';
import { PuarProposalService } from './services/puar-proposal.service';
import { ReconAnalyticsService } from './services/recon-analytics.service';
import { ReconCorrelationService } from './services/recon-correlation.service';
import { ReconCoreIntegrationService } from './services/recon-core-integration.service';
import { ReconHeatmapService } from './services/recon-heatmap.service';
import { ReconProcessedTargetService } from './services/recon-processed-target.service';
import { ReconSettingsService } from './services/recon-settings.service';
import { ReconService } from './services/recon.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReconArea,
      ReconAssessment,
      ReconCorrelation,
      ReconEvent,
      ReconImpactObservation,
      ReconImportBatch,
      ReconImportError,
      ReconIntelligenceReport,
      ReconObservation,
      ReconPuarProposal,
      ReconProcessedTargetDecision,
      ReconSetting,
      ReconTarget,
      ReconTargetObservation,
    ]),
    RealtimeModule,
  ],
  controllers: [ReconController],
  providers: [
    ReconService,
    ReconSettingsService,
    ReconAnalyticsService,
    ReconEventsService,
    TargetClusteringEngine,
    ConfidenceEngine,
    ActivityIndexEngine,
    FreshnessEngine,
    ThreatIndexEngine,
    CorrelationEngine,
    HeatmapEngine,
    AreaComparisonEngine,
    DailyReportEngine,
    ReconCorrelationService,
    ReconHeatmapService,
    PuarProposalService,
    ReconCoreIntegrationService,
    ReconProcessedTargetService,
  ],
  exports: [ReconCoreIntegrationService],
})
export class ReconModule {}
