import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type {
  ExecutionPurpose,
  ExecutionResult,
  ExecutionType,
} from '../execution-record.entity';
import type { CompositionSource } from '../execution-record-artillery.entity';
import type { ExecutionChargeAccountingUnit } from '../execution-record-charge.entity';

export class ExecutionChargeComponentDto {
  @IsUUID()
  chargeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  chargeName!: string;

  @IsInt()
  @IsPositive()
  quantityPerShot!: number;

  @IsIn(['piece', 'module'])
  accountingUnit!: ExecutionChargeAccountingUnit;

  @IsInt()
  sortOrder!: number;
}

export class ArtilleryExecutionDto {
  @IsIn(['planned', 'template', 'manual'])
  compositionSource!: CompositionSource;

  @IsOptional()
  @IsUUID()
  sourceShotConfigurationId?: string;

  @IsUUID()
  weaponModelId!: string;

  @IsUUID()
  shellId!: string;

  @IsUUID()
  fuzeId!: string;

  @IsUUID()
  primerId!: string;

  @IsUUID()
  zoneId!: string;

  @IsInt()
  @IsPositive()
  maxRangeM!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExecutionChargeComponentDto)
  charges!: ExecutionChargeComponentDto[];

  @IsObject()
  compositionSnapshot!: Record<string, unknown>;
}

export class CreateExecutionRecordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  idempotencyKey!: string;

  @IsIn(['artillery', 'mortar', 'mlrs', 'fpv', 'bomber', 'other'])
  executionType!: ExecutionType;

  @IsIn([
    'barrel_warmup',
    'adjustment',
    'main_fire',
    'additional_fire',
    'other',
    'main',
    'warmup',
    'calibration',
    'test',
  ])
  purpose!: ExecutionPurpose;

  @IsIn(['executed', 'misfire', 'aborted', 'cancelled'])
  result!: ExecutionResult;

  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  executorType?: string;

  @IsOptional()
  @IsUUID()
  executorId?: string;

  @IsOptional()
  @IsObject()
  executorSnapshot?: Record<string, unknown>;

  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsObject()
  resourceSnapshot?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ArtilleryExecutionDto)
  artillery?: ArtilleryExecutionDto;
}
