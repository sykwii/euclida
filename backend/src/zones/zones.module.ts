import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Zone } from './zone.entity';
import { ZonesController } from './zones.controller';
import { ZonesService } from './zones.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([Zone])],
  controllers: [ZonesController],
  providers: [ZonesService],
})
export class ZonesModule {}