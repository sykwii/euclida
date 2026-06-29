import { IsOptional, IsUUID } from 'class-validator';

export class AssignWeaponToFirePositionDto {
  /**
   * Новий цільовий ID ВП. Основне поле для поточного frontend.
   */
  @IsOptional()
  @IsUUID()
  targetFirePositionId?: string;

  /**
   * Залишено для сумісності зі старими формами.
   */
  @IsOptional()
  @IsUUID()
  firePositionId?: string;

  /**
   * Не використовується для призначення СГ. Приймається тільки для сумісності,
   * щоб ValidationPipe не відхиляв старі запити.
   */
  @IsOptional()
  @IsUUID()
  unitId?: string;
}
