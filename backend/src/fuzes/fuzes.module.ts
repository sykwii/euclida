import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fuze } from './fuze.entity';
import { FuzesController } from './fuzes.controller';
import { FuzesService } from './fuzes.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([Fuze])],
  controllers: [FuzesController],
  providers: [FuzesService],
})
export class FuzesModule {}