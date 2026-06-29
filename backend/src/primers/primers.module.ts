import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Primer } from './primer.entity';
import { PrimersController } from './primers.controller';
import { PrimersService } from './primers.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([Primer])],
  controllers: [PrimersController],
  providers: [PrimersService],
})
export class PrimersModule {}