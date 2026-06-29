import { IsNumber, IsString, MaxLength } from 'class-validator';

export class CreateAirThreatDto {
  @IsString()
  @MaxLength(100)
  threatType!: string;

  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}