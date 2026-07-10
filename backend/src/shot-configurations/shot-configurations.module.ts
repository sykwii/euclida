import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Charge } from '../charges/charge.entity';
import { Fuze } from '../fuzes/fuze.entity';
import { Primer } from '../primers/primer.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { Shell } from '../shells/shell.entity';
import { WeaponModel } from '../weapon-models/weapon-model.entity';
import { Zone } from '../zones/zone.entity';
import { ShotConfigurationCharge } from './shot-configuration-charge.entity';
import { ShotConfiguration } from './shot-configuration.entity';
import { ShotConfigurationsController } from './shot-configurations.controller';
import { ShotConfigurationsService } from './shot-configurations.service';

@Module({
  imports: [
    RealtimeModule,
    TypeOrmModule.forFeature([
      ShotConfiguration,
      ShotConfigurationCharge,
      WeaponModel,
      Shell,
      Fuze,
      Primer,
      Zone,
      Charge,
    ]),
  ],
  controllers: [ShotConfigurationsController],
  providers: [ShotConfigurationsService],
  exports: [ShotConfigurationsService, TypeOrmModule],
})
export class ShotConfigurationsModule {}
