import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateDepotFuzeStockDto {
  @IsUUID()
  depotId!: string;

  @IsUUID()
  fuzeId!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}
