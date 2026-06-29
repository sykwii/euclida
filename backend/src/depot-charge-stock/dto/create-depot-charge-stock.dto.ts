import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateDepotChargeStockDto {
  @IsUUID()
  depotId!: string;

  @IsUUID()
  chargeId!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;
}