import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeEventsService } from './realtime-events.service';
import { RealtimeGateway } from './realtime.gateway';
import { Unit } from '../units/unit.entity';
import { User } from '../users/user.entity';
import { buildJwtModuleOptions } from '../auth/jwt-config';

@Module({
  imports: [
    AccessScopeModule,
    ConfigModule,
    TypeOrmModule.forFeature([Unit, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: buildJwtModuleOptions,
    }),
  ],
  providers: [RealtimeGateway, RealtimeEventsService],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
