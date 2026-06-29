import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { AuthModule } from '../auth/auth.module';
import { EventLog } from './event-log.entity';
import { EventLogsController } from './event-logs.controller';
import { EventLogsService } from './event-logs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventLog]),
    AuthModule,
    AccessScopeModule,
  ],
  controllers: [EventLogsController],
  providers: [EventLogsService],
  exports: [EventLogsService],
})
export class EventLogsModule {}