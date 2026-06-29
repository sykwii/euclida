export interface ServiceOrderMapResult {
  id: string;
  orderNumber: string;
  targetLat: number;
  targetLng: number;
  targetMgrs: string | null;
  targetSettlement: string | null;
  taskType: string;
  resultType: string | null;
  resultComment: string | null;
  completedAt: string | null;
  plannedQuantity: number;
  actualQuantity: number | null;
  firePositionName: string | null;
  unitName: string | null;
  shellMarking: string | null;
  chargeMarking: string | null;
  zoneName: string | null;
}