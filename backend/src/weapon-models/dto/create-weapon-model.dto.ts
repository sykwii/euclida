import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class CreateWeaponModelDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(50)
  systemType: string;

  @IsInt()
  @Min(0)
  zonesCount: number;
}