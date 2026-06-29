import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirePosition } from '../fire-positions/fire-position.entity';
import { SettingsModule } from '../settings/settings.module';
import { AirThreat } from './air-threat.entity';
import { AirThreatsController } from './air-threats.controller';
import { AirThreatsService } from './air-threats.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, 
    TypeOrmModule.forFeature([AirThreat, FirePosition]),
    SettingsModule,
  ],
  controllers: [AirThreatsController],
  providers: [AirThreatsService],
  exports: [AirThreatsService],
})
export class AirThreatsModule {}
