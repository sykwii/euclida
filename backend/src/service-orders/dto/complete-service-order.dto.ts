import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CompleteServiceOrderDto {
  @IsDateString()
  startedAt!: string;

  @IsDateString()
  completedAt!: string;

  @IsInt()
  @Min(1)
  actualQuantity!: number;

  @IsString()
  resultType!: string;

  @IsOptional()
  @IsString()
  resultComment?: string;
}