import { IsUUID } from 'class-validator';

export class CreateFirePositionWeaponDto {
  @IsUUID()
  firePositionId!: string;

  @IsUUID()
  weaponSystemId!: string;
}