import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateDepotPrimerStockDto {
  @IsUUID()
  depotId!: string;

  @IsUUID()
  primerId!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}