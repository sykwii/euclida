import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RespondServiceOrderDeliveryDto {
  @IsIn(['accepted', 'rejected'])
  status!: 'accepted' | 'rejected';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsString()
  estimatedReadyAt?: string;

  @IsOptional()
  @IsUUID()
  selectedFirePositionId?: string;

  @IsOptional()
  @IsUUID()
  selectedWeaponSystemId?: string;
}
