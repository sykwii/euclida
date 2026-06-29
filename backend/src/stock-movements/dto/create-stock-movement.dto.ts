import { IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateStockMovementDto {
  @IsOptional()
  @IsUUID()
  fromDepotId?: string;

  @IsOptional()
  @IsUUID()
  toDepotId?: string;

  @IsIn(['shell', 'charge', 'fuze', 'primer'])
  itemType!: string;

  @IsUUID()
  itemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  comment?: string;

@IsOptional()
@IsIn(['external_supply', 'transfer'])
movementType?: string;

}
