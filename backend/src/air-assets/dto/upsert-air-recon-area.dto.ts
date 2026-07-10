import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export type AirReconAreaStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export class AirReconAreaPointInput {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pointOrder?: number;
}

export class UpsertAirReconAreaDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  activeDate?: string;

  @IsOptional()
  @IsString()
  plannedStartAt?: string;

  @IsOptional()
  @IsString()
  plannedEndAt?: string;

  @IsOptional()
  @IsIn(['planned', 'active', 'completed', 'cancelled'])
  status?: AirReconAreaStatus;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AirReconAreaPointInput)
  points!: AirReconAreaPointInput[];
}
