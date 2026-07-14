import { IsOptional, IsString } from 'class-validator';

export class CompleteWeaponMaintenanceDto {
  @IsOptional()
  @IsString()
  result?: string;
}
