import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateWeaponDeploymentDto {
  @IsOptional()
  @IsUUID()
  targetFirePositionId?: string | null;

  @IsOptional()
  @IsUUID()
  firePositionId?: string | null;

  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
