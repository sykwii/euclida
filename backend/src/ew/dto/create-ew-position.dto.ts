import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

export class EwFrequencyRangeDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsNumber()
  frequencyFromMhz!: number;

  @IsNumber()
  frequencyToMhz!: number;
}

export class CreateEwPositionDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsUUID()
  unitId!: string;

  @IsString()
  @MaxLength(100)
  callsign!: string;

  @IsString()
  @MaxLength(255)
  stationName!: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  mgrs?: string;

  @IsIn(['radius', 'sector'])
  effectMode!: 'radius' | 'sector';

  @IsOptional()
  @IsInt()
  @Min(1)
  radiusM?: number;

  @IsOptional()
  @IsNumber()
  mainDirectionUnits?: number;

  @IsOptional()
  @IsNumber()
  traverseLeftUnits?: number;

  @IsOptional()
  @IsNumber()
  traverseRightUnits?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  readinessStatus?: string;

  @IsOptional()
  @IsString()
  notReadyReason?: string;

  @IsOptional()
  @IsString()
  personnelRotationDate?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EwFrequencyRangeDto)
  frequencyRanges!: EwFrequencyRangeDto[];
}
