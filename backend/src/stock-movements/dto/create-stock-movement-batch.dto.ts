import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockMovementBatchItemDto {
  @IsIn(['shell', 'charge', 'fuze', 'primer'])
  itemType!: string;

  @IsUUID()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateStockMovementBatchDto {
  @IsOptional()
  @IsUUID()
  fromDepotId?: string;

  @IsOptional()
  @IsUUID()
  toDepotId?: string;

  @IsOptional()
  @IsString()
  comment?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockMovementBatchItemDto)
  items!: StockMovementBatchItemDto[];
}
