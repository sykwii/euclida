import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class SendServiceOrderDto {
  /**
   * Залишено тільки для сумісності зі старим frontend.
   * Нова логіка не дозволяє вручну обирати підрозділ: заявка передається на ПУВБ
   * за вибраною ВП, а оператор дивізіону бачить її автоматично через ієрархію.
   */
  @IsOptional()
  @IsIn(['division', 'battery'])
  assignedScope?: 'division' | 'battery';

  @IsOptional()
  @IsUUID()
  assignedUnitId?: string;
}
