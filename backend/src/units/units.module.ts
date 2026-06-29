import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Unit } from './unit.entity';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, 
    TypeOrmModule.forFeature([Unit]),
    AuthModule,
  ],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}