import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateDepotShellStockDto {
  @IsUUID()
  depotId!: string;

  @IsUUID()
  shellId!: string;

  @IsInt()
  @Min(0)
  quantity!: number;
}
