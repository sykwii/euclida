export interface AnalyticsCounter {
  total: number;
  ready: number;
  notReady: number;
  unknown: number;
}

export interface FirePositionAnalyticsCounter extends AnalyticsCounter {
  withSg: number;
  withoutSg: number;
}

export interface StatusCount {
  status: string;
  total: number;
}

export interface NamedCount {
  id: string | null;
  name: string;
  total: number;
}

export interface AmmoStockSummary {
  shells: number;
  charges: number;
  fuzes: number;
  primers: number;
}

export interface DepotStockSummary {
  depotId: string;
  depotName: string;
  depotType: string | null;
  shells: number;
  charges: number;
  fuzes: number;
  primers: number;
  total: number;
}

export interface AnalyticsDashboard {
  timezone: 'Europe/Kyiv';
  generatedAt: string;
  generatedAtKyiv: string;
  weapons: AnalyticsCounter;
  firePositions: FirePositionAnalyticsCounter;
  ammo: AmmoStockSummary;
  serviceOrders: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
    rejected: number;
    statuses: StatusCount[];
    completedToday: number;
    completedLast7Days: number;
    averageCompletionHours: number | null;
  };
  fireMissions: {
    total: number;
    completed: number;
    active: number;
    plannedToday: number;
    completedToday: number;
    statuses: StatusCount[];
  };
  load: {
    byUnit: NamedCount[];
    byFirePosition: NamedCount[];
  };
  kpi: {
    serviceOrderCompletionRate: number;
    weaponReadinessRate: number;
    firePositionReadinessRate: number;
    ammoTotalUnits: number;
  };
  warnings: string[];
  depotStocks: DepotStockSummary[];
}


export interface LogisticsFlowRow {
  firePositionId: string | null;
  firePositionName: string;
  depotId: string | null;
  depotName: string;
  received: number;
  spent: number;
  balance: number;
  estimatedDaysLeft: number | null;
}

export interface AmmoRecipientAnalyticsRow {
  depotId: string | null;
  depotName: string;
  firePositionId: string | null;
  firePositionName: string | null;
  unitId: string | null;
  unitName: string | null;
  deliveries: number;
  totalQuantity: number;
  shells: number;
  charges: number;
  fuzes: number;
  primers: number;
  lastDeliveryAt: string | null;
}

export interface ShootingDailyRow {
  day: string;
  missions: number;
  actualQuantity: number;
}

export interface ShootingBreakdownRow {
  id: string | null;
  name: string;
  missions: number;
  actualQuantity: number;
}

export interface ShootingAnalytics {
  days: number;
  totalMissions: number;
  totalActualQuantity: number;
  averageActualQuantity: number;
  daily: ShootingDailyRow[];
  byUnit: ShootingBreakdownRow[];
  byFirePosition: ShootingBreakdownRow[];
  byResultType: ShootingBreakdownRow[];
  byTaskType: ShootingBreakdownRow[];
  byShell: ShootingBreakdownRow[];
  byCharge: ShootingBreakdownRow[];
}

export interface AnalyticsV2ReadinessReasonRow {
  reason: string;
  total: number;
}

export interface AnalyticsV2Readiness {
  weapons: {
    total: number;
    ready: number;
    notReady: number;
    unknown: number;
    notReadyReasons: AnalyticsV2ReadinessReasonRow[];
  };
  firePositions: {
    total: number;
    ready: number;
    notReady: number;
    unknown: number;
    notReadyReasons: AnalyticsV2ReadinessReasonRow[];
    threatNotReady: AnalyticsV2ReadinessReasonRow[];
  };
}

export interface AnalyticsV2DeliveryTopRow {
  firePositionId: string | null;
  firePositionName: string;
  unitId: string | null;
  unitName: string | null;
  depotId: string | null;
  depotName: string | null;
  deliveries: number;
  totalQuantity: number;
  shells: number;
  charges: number;
  fuzes: number;
  primers: number;
  lastDeliveryAt: string | null;
}

export interface AnalyticsV2FirePositionTaskRow {
  firePositionId: string | null;
  firePositionName: string;
  unitId: string | null;
  unitName: string | null;
  completedTasks: number;
  actualQuantity: number;
}

export interface AnalyticsV2LowAmmoRow {
  firePositionId: string;
  firePositionName: string;
  unitId: string | null;
  unitName: string | null;
  depotId: string | null;
  shellBalance: number;
}

export interface AnalyticsV2RotationRow {
  firePositionId: string;
  firePositionName: string;
  unitId: string | null;
  unitName: string | null;
  personnelRotationDate: string | null;
  daysSinceRotation: number | null;
  daysLeft: number | null;
  level: 'ok' | 'soon' | 'overdue' | 'unknown';
}

export interface AnalyticsV2AmmoForecastRow {
  firePositionId: string;
  firePositionName: string;
  unitId: string | null;
  unitName: string | null;
  depotId: string | null;
  shellBalance: number;
  averageDailyConsumption: number;
  estimatedDaysLeft: number | null;
  level: 'ok' | 'warning' | 'critical' | 'unknown';
}

export interface AnalyticsV2WeaponEfficiencyRow {
  weaponSystemId: string | null;
  weaponName: string;
  firePositionId: string | null;
  firePositionName: string | null;
  unitId: string | null;
  unitName: string | null;
  completedTasks: number;
  possibleScore: number;
  actualScore: number;
  efficiencyPercent: number;
}

export interface AnalyticsV2AttentionItem {
  level: 'critical' | 'warning' | 'info';
  title: string;
  details: string;
  entityId?: string | null;
}

export interface OperationalAnalyticsV2 {
  timezone: 'Europe/Kyiv';
  periodDays: number;
  generatedAt: string;
  generatedAtKyiv: string;
  readiness: AnalyticsV2Readiness;
  deliveriesTop: AnalyticsV2DeliveryTopRow[];
  tasksTopByFirePosition: AnalyticsV2FirePositionTaskRow[];
  lowAmmoFirePositions: AnalyticsV2LowAmmoRow[];
  rotation: AnalyticsV2RotationRow[];
  ammoForecast: AnalyticsV2AmmoForecastRow[];
  threatBlockedFirePositions: AnalyticsV2ReadinessReasonRow[];
  weaponEfficiency: {
    top: AnalyticsV2WeaponEfficiencyRow[];
    bottom: AnalyticsV2WeaponEfficiencyRow[];
  };
  attention: AnalyticsV2AttentionItem[];
}
