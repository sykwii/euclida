export type ChargeKind = 'unit' | 'modular';

export interface Charge {
  id: string;
  marking: string;
  packagingType: string;
  measurementUnit: string;
  chargeKind: ChargeKind;
  modulesPerCharge: number | null;
  maxUsableModules: number | null;
  moduleNote: string | null;
  createdAt: string;
  updatedAt: string;
}
