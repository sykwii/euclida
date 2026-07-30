import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  RECON_INPUT_PROVIDERS,
  RECON_SOURCES,
  RECON_TARGET_STATUSES,
  RECON_TARGET_TYPES,
} from '../recon.types';
import type {
  ReconAssessmentStatus,
  ReconAssessmentType,
  ReconInputProvider,
  ReconSource,
  ReconTargetStatus,
  ReconTargetType,
} from '../recon.types';

export class CreateReconAreaDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  description?: string;

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(1_000)
  coordinates!: [number, number][];
}

export class CreateReconReportDto {
  @IsString()
  title!: string;

  @IsIn(RECON_SOURCES)
  source!: ReconSource;

  @IsOptional()
  @IsIn(RECON_INPUT_PROVIDERS)
  inputProvider?: ReconInputProvider;

  @IsOptional()
  @IsString()
  reportDatetime?: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class CreateReconObservationDto {
  @IsOptional()
  @IsString()
  platformId?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsIn(RECON_SOURCES)
  source!: ReconSource;

  @IsOptional()
  @IsIn(RECON_INPUT_PROVIDERS)
  inputProvider?: ReconInputProvider;

  @IsIn(RECON_TARGET_TYPES)
  targetType!: ReconTargetType;

  @IsString()
  observationDatetime!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  mgrs?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}

export class CreateReconImpactDto extends CreateReconObservationDto {
  @IsString()
  impactDatetime!: string;
}

export class DeltaImportDto {
  @IsString()
  @MaxLength(1_000_000)
  csv!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;

  @IsOptional()
  @IsString()
  source?: ReconSource;

  @IsOptional()
  @IsString()
  duplicateStrategy?: 'skip' | 'cancel' | 'update-preview';

  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;

  @IsOptional()
  @IsIn(RECON_TARGET_TYPES)
  targetTypeOverride?: ReconTargetType;
}

export class CreateReconTargetDto {
  @IsOptional()
  @IsString()
  platformId?: string;

  @IsIn(RECON_TARGET_TYPES)
  targetType!: ReconTargetType;

  @IsOptional()
  @IsArray()
  possibleTargetTypes?: ReconTargetType[];

  @IsOptional()
  @IsIn(RECON_TARGET_STATUSES)
  status?: ReconTargetStatus;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @IsOptional()
  @IsString()
  mgrs?: string;

  @IsOptional()
  @IsString()
  observationId?: string;
}

export class UpdateTargetStatusDto {
  @IsIn(RECON_TARGET_STATUSES)
  status!: ReconTargetStatus;
}

export class MergeTargetsDto {
  @IsArray()
  targetIds!: string[];
}

export class ExcludeObservationDto {
  @IsString()
  observationId!: string;
}

export class CreateReconAssessmentDto {
  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  proposedBy?: string;

  @IsOptional()
  @IsString()
  confirmedBy?: string;

  @IsOptional()
  @IsString()
  status?: ReconAssessmentStatus;

  @IsOptional()
  @IsString()
  assessmentType?: ReconAssessmentType;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReconListQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  offset?: number;
}

export class RecalculateCorrelationsDto {
  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  impactId?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class HeatmapQueryDto {
  @IsOptional()
  @IsString()
  _ts?: string;

  @IsOptional()
  @IsString()
  type?: 'observation' | 'target' | 'activity' | 'threat';

  @IsOptional()
  @IsString()
  period?: 'today' | '24h' | '7d' | '30d' | 'custom';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class CreatePuarProposalDto {
  @IsOptional()
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  observationId?: string;

  @IsOptional()
  @IsString()
  comments?: string;
}

export class ProcessedTargetDecisionDto {
  @IsString()
  observationId!: string;

  @IsString()
  decision!: 'attach' | 'new_target' | 'ignore';
}
