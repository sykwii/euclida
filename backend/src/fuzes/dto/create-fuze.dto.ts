import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFuzeDto {
  @IsString()
  @MaxLength(100)
  marking!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  material?: string;
}