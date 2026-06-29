import { IsUUID } from 'class-validator';

export class CreateShellCompatibleFuzeDto {
  @IsUUID()
  shellId!: string;

  @IsUUID()
  fuzeId!: string;
}