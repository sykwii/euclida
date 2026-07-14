import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class OpenWeaponMaintenanceDto {
  @IsOptional()
  @IsIn(['breakdown', 'scheduled', 'inspection', 'other'])
  reason?: string;

  @IsOptional()
  @IsString()
  startedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
