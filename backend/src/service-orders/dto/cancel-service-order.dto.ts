import { IsOptional, IsString } from 'class-validator';

export class CancelServiceOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
