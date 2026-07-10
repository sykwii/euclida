import { IsArray, IsOptional, IsUUID } from 'class-validator';

export class MarkReadEventLogsDto {
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  ids?: string[];
}
