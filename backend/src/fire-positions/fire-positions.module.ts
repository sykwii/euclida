import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FirePosition } from './fire-position.entity';
import { FirePositionsController } from './fire-positions.controller';
import { FirePositionsService } from './fire-positions.service';
import { Depot } from '../depots/depot.entity';
import { AuthModule } from '../auth/auth.module';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, TypeOrmModule.forFeature([FirePosition, Depot]), AuthModule,
  AccessScopeModule,],
  controllers: [FirePositionsController],
  providers: [FirePositionsService],
})
export class FirePositionsModule {}