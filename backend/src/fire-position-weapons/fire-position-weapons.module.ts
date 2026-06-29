import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirePositionWeapon } from './fire-position-weapon.entity';
import { FirePositionWeaponsController } from './fire-position-weapons.controller';
import { FirePositionWeaponsService } from './fire-position-weapons.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([FirePositionWeapon])],
  controllers: [FirePositionWeaponsController],
  providers: [FirePositionWeaponsService],
})
export class FirePositionWeaponsModule {}