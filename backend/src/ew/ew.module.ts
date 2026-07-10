import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { EwController } from './ew.controller';
import { EwFrequencyRange } from './ew-frequency-range.entity';
import { EwPosition } from './ew-position.entity';
import { EwService } from './ew.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [    AuthModule,
TypeOrmModule.forFeature([EwPosition, EwFrequencyRange]), AccessScopeModule, RealtimeModule],
  controllers: [EwController],
  providers: [EwService],
  exports: [EwService],
})
export class EwModule {}
