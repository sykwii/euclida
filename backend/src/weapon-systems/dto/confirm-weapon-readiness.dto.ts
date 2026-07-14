import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConfirmWeaponReadinessDto {
  @IsIn(['combat_ready', 'not_combat_ready'])
  readinessStatus!: string;

  @IsOptional()
  @IsIn(['breakdown', 'threat', 'crew', 'maintenance', 'other'])
  notReadyReason?: string | null;

  @IsOptional()
  @IsString()
  note?: string;
}
