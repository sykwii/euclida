import { IsString, MinLength } from 'class-validator';

export class RejectServiceOrderDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
