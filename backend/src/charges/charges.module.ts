import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Charge } from './charge.entity';
import { ChargesController } from './charges.controller';
import { ChargesService } from './charges.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([Charge])],
  controllers: [ChargesController],
  providers: [ChargesService],
})
export class ChargesModule {}