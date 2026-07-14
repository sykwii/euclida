import type { AuthUser } from '../auth/auth-user.types';
import type { StockOperation } from '../stock-engine/stock-operation.entity';
import type { StockResourceRef } from '../stock-engine/contracts';
import type { ServiceOrder } from '../service-orders/service-order.entity';
import type { CreateExecutionRecordDto } from './dto/create-execution-record.dto';
import type { ExecutionHandler } from './execution-handler.interface';
import type { ExecutionRecord } from './execution-record.entity';

export interface ExecutionPipelineChargeSnapshot {
  chargeId: string;
  chargeNameSnapshot: string;
  quantityPerShot: number;
  accountingUnit: 'piece' | 'module';
  sortOrder: number;
}

export interface ExecutionPipelineArtillerySnapshot {
  compositionSource: 'planned' | 'template' | 'manual';
  sourceShotConfigurationId: string | null;
  weaponModelId: string;
  shellId: string;
  fuzeId: string;
  primerId: string;
  zoneId: string | null;
  maxRangeM: number;
  compositionSnapshot: Record<string, unknown>;
  charges: ExecutionPipelineChargeSnapshot[];
}

export interface ExecutionPipelineContext {
  serviceOrderId: string;
  serviceOrder: ServiceOrder;
  body: CreateExecutionRecordDto;
  user: AuthUser;
  handler: ExecutionHandler;
  unitId: string | null;
  startedAt: Date;
  completedAt: Date | null;
  executorSnapshot: Record<string, unknown>;
  resourceSnapshot: Record<string, unknown>;
  artillerySnapshot: ExecutionPipelineArtillerySnapshot | null;
  consumption: StockResourceRef[];
  stockOperation: StockOperation | null;
  existingRecord: ExecutionRecord | null;
}
