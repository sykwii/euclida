export type ServiceOrderStatus =
  | 'draft'
  | 'proposed'
  | 'sent'
  | 'sent_to_division'
  | 'sent_to_battery'
  | 'accepted'
  | 'rejected'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type ServiceOrderAssignedScope = 'division' | 'battery';

export interface ServiceOrderUnitRef {
  id: string;
  name: string;
  type?: string | null;
  parentId?: string | null;
}

export interface ServiceOrder {
  id: string;
  orderNumber: string;
  status: ServiceOrderStatus | string;

  createdByUserId: string | null;
  assignedUnitId: string | null;
  assignedScope: ServiceOrderAssignedScope | null;
  sentByUserId: string | null;
  acceptedByUserId: string | null;
  completedByUserId: string | null;

  actualQuantity: number | null;

  targetLat: number;
  targetLng: number;
  targetMgrs: string | null;
  targetSettlement: string | null;

  taskType: string;

  plannedResourceAId: string | null;
  plannedResourceBId: string | null;
  plannedQuantity: number;

  selectedFirePositionId: string | null;
  selectedShellId?: string | null;
  selectedChargeId?: string | null;
  selectedZoneId?: string | null;

  rejectionReason: string | null;
  rejectedByUnitName: string | null;
  rejectedAt: string | null;

  startedAt: string | null;
  completedAt: string | null;

  resultType: string | null;
  resultComment: string | null;

  createdAt: string;
  updatedAt: string;

  selectedFirePosition: {
    id: string;
    name: string;
    unitId?: string | null;
    unit?: ServiceOrderUnitRef | null;
  } | null;

  selectedShell: {
    id: string;
    marking: string;
  } | null;

  selectedCharge: {
    id: string;
    marking: string;
  } | null;

  selectedZone: {
    id: string;
    zoneNumber: number;
    distanceFromM: number;
    distanceToM: number;
  } | null;
}
