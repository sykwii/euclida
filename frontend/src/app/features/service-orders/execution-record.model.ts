export type ExecutionRecordPurpose =
  | 'barrel_warmup'
  | 'adjustment'
  | 'main_fire'
  | 'additional_fire'
  | 'other';

export type ExecutionRecordStatus = 'draft' | 'posted' | 'reversed' | 'cancelled';

export interface ExecutionRecordCharge {
  chargeId: string;
  chargeNameSnapshot: string;
  quantityPerShot: number;
  accountingUnit: 'piece' | 'module';
  sortOrder: number;
}

export interface ExecutionRecord {
  id: string;
  serviceOrderId: string;
  idempotencyKey: string;
  executionType: string;
  purpose: ExecutionRecordPurpose | string;
  result: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  postedAt: string | null;
  quantity: number;
  comment: string | null;
  status: ExecutionRecordStatus | string;
  stockOperationId: string | null;
  artillery?: {
    compositionSource: 'planned' | 'template' | 'manual';
    sourceShotConfigurationId: string | null;
    weaponModelId: string;
    shellId: string;
    fuzeId: string;
    primerId: string;
    zoneId: string | null;
    maxRangeM: number;
    compositionSnapshot: Record<string, unknown>;
    charges: ExecutionRecordCharge[];
  } | null;
}

export interface ExecutionValidationResult {
  valid: boolean;
  reasons: Array<{
    code: string;
    message: string;
    resourceType?: string;
    resourceId?: string;
    required?: number;
    available?: number;
  }>;
  consumptionPreview: Array<{
    resourceType: string;
    resourceId: string;
    required: number;
    available: number;
    accountingUnit?: string;
  }>;
}
