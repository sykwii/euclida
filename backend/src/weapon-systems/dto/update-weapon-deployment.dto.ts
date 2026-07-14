import { IsOptional, IsString } from 'class-validator';

export class UpdateWeaponDeploymentDto {
  @IsOptional()
  @IsString()
  note?: string;
}
