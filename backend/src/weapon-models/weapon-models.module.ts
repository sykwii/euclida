import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeaponModel } from './weapon-model.entity';
import { WeaponModelsController } from './weapon-models.controller';
import { WeaponModelsService } from './weapon-models.service';
import { RealtimeModule } from '../realtime/realtime.module';


@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([WeaponModel])],
  controllers: [WeaponModelsController],
  providers: [WeaponModelsService],
})
export class WeaponModelsModule {}