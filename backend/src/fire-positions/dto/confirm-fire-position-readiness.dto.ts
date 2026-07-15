import { IsIn, IsOptional, IsString } from 'class-validator';

export class ConfirmFirePositionReadinessDto {
  @IsOptional()
  @IsIn(['combat_ready', 'not_combat_ready'])
  readinessStatus?: 'combat_ready' | 'not_combat_ready';

  @IsOptional()
  @IsIn(['threat', 'damaged', 'prohibited', 'other'])
  notReadyReason?: 'threat' | 'damaged' | 'prohibited' | 'other' | null;

  @IsOptional()
  @IsString()
  note?: string;
}
