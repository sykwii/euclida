import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePrimerDto {
  @IsString()
  @MaxLength(100)
  marking!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ammoType?: string;
}