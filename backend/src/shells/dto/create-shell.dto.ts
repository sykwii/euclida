import { IsString, MaxLength } from 'class-validator';

export class CreateShellDto {
  @IsString()
  @MaxLength(50)
  systemType: string;

  @IsString()
  @MaxLength(100)
  damageType: string;

  @IsString()
  @MaxLength(100)
  marking: string;
}