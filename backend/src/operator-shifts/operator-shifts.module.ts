import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AuthModule } from '../auth/auth.module';
import { EventLogsModule } from '../event-logs/event-logs.module';
import { OperatorShift } from './operator-shift.entity';
import { OperatorShiftsController } from './operator-shifts.controller';
import { OperatorShiftsService } from './operator-shifts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperatorShift]),
    AuthModule,
    AccessScopeModule,
    EventLogsModule,
  ],
  controllers: [OperatorShiftsController],
  providers: [OperatorShiftsService],
  exports: [OperatorShiftsService],
})
export class OperatorShiftsModule {}
