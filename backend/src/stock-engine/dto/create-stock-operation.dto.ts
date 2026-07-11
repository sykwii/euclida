import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class StockOperationResourceDto {
  @IsIn(['shell', 'charge', 'fuze', 'primer', 'drone', 'warhead']) resourceType!: 'shell' | 'charge' | 'fuze' | 'primer' | 'drone' | 'warhead';
  @IsUUID() resourceId!: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 3 }) @IsPositive() quantity!: number;
  @IsOptional() @IsIn(['piece', 'module']) accountingUnit?: 'piece' | 'module';
}

export class CreateStockOperationDto {
  @IsString() @MaxLength(160) idempotencyKey!: string;
  @IsIn(['receipt', 'transfer', 'write_off', 'return', 'correction']) operationType!: 'receipt' | 'transfer' | 'write_off' | 'return' | 'correction';
  @IsOptional() @IsUUID() fromDepotId?: string;
  @IsOptional() @IsUUID() toDepotId?: string;
  @IsOptional() @IsString() @MaxLength(80) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => StockOperationResourceDto) resources!: StockOperationResourceDto[];
}
