import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessScopeModule } from '../access-scope/access-scope.module';
import { EventLogsModule } from '../event-logs/event-logs.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ServiceOrder } from '../service-orders/service-order.entity';
import { StockEngineModule } from '../stock-engine/stock-engine.module';
import { ArtilleryExecutionHandler } from './artillery-execution.handler';
import { ExecutionController } from './execution.controller';
import { ExecutionConsumptionCalculator } from './execution-consumption.calculator';
import { ExecutionCorrection } from './execution-correction.entity';
import {
  EXECUTION_HANDLERS,
  ExecutionEngineService,
} from './execution-engine.service';
import { ExecutionJournalWriter } from './execution-journal.writer';
import { ExecutionRecordArtillery } from './execution-record-artillery.entity';
import { ExecutionRecordCharge } from './execution-record-charge.entity';
import { ExecutionRecord } from './execution-record.entity';
import { ExecutionService } from './execution.service';
import { ExecutionSnapshotBuilder } from './execution-snapshot.builder';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ServiceOrder,
      ExecutionRecord,
      ExecutionRecordArtillery,
      ExecutionRecordCharge,
      ExecutionCorrection,
    ]),
    AccessScopeModule,
    EventLogsModule,
    RealtimeModule,
    StockEngineModule,
  ],
  controllers: [ExecutionController],
  providers: [
    ArtilleryExecutionHandler,
    {
      provide: EXECUTION_HANDLERS,
      useFactory: (
        artilleryHandler: ArtilleryExecutionHandler,
      ) => [artilleryHandler],
      inject: [ArtilleryExecutionHandler],
    },
    ExecutionSnapshotBuilder,
    ExecutionConsumptionCalculator,
    ExecutionJournalWriter,
    ExecutionEngineService,
    ExecutionService,
  ],
  exports: [ExecutionService],
})
export class ExecutionModule {}
