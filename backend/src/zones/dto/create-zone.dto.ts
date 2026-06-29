import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateZoneDto {
  @IsUUID()
  weaponModelId!: string;

  @IsInt()
  @Min(1)
  zoneNumber!: number;

  @IsInt()
  @Min(0)
  distanceFromM!: number;

  @IsInt()
  @Min(0)
  distanceToM!: number;
}