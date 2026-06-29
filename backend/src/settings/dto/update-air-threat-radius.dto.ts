import { IsInt, Min } from 'class-validator';

export class UpdateAirThreatRadiusDto {
  @IsInt()
  @Min(1)
  radiusM!: number;
}