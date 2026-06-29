export interface FireMission {
  id: string;
  missionDatetime: string;
  status: string;
  targetNumber: string | null;
  targetType: string | null;
  targetSettlement: string | null;

  shellQuantity: number | null;
  chargeQuantity: number | null;
  primerQuantity: number | null;
  fuzeQuantity: number | null;

  actualShellQuantity: number | null;
  actualChargeQuantity: number | null;
  actualPrimerQuantity: number | null;
  actualFuzeQuantity: number | null;

  completedAt: string | null;

  executingUnit?: { name: string } | null;
  firePosition?: { name: string } | null;
  weaponSystem?: {
    callsign: string | null;
    weaponModel?: { name: string } | null;
  } | null;
  shell?: { marking: string } | null;
  charge?: { marking: string } | null;
  primer?: { marking: string } | null;
  fuze?: { marking: string } | null;
}