import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { Depot } from './depot.entity';
import { DepotsController } from './depots.controller';
import { DepotsService } from './depots.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([Depot]), AccessScopeModule],
  controllers: [DepotsController],
  providers: [DepotsService],
})
export class DepotsModule {}
