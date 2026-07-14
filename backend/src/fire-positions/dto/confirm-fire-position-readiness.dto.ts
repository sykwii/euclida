import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConfirmFirePositionReadinessDto {
  @IsOptional()
  @IsIn(['combat_ready', 'not_combat_ready'])
  readinessStatus?: 'combat_ready' | 'not_combat_ready';

  @IsOptional()
  @IsIn(['threat', 'damaged', 'not_prepared', 'occupied', 'other'])
  notReadyReason?: 'threat' | 'damaged' | 'not_prepared' | 'occupied' | 'other' | null;

  @IsOptional()
  @IsString()
  note?: string;
}
