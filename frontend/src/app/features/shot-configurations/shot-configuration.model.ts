export interface ShotConfigurationChargeComponent {
  id?: string;
  chargeId: string;
  quantityPerShot: number;
  sortOrder: number;
  charge: {
    id: string;
    marking: string;
    chargeKind?: 'unit' | 'modular';
    measurementUnit?: string;
  };
}

export interface ShotConfiguration {
  id: string;
  name: string;
  weaponModelId: string;
  shellId: string;
  fuzeId: string | null;
  primerId: string | null;
  zoneId: string | null;
  maxRangeM: number;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  weaponModel: {
    id: string;
    name: string;
  };
  shell: {
    id: string;
    marking: string;
  };
  fuze: {
    id: string;
    marking: string;
  } | null;
  primer: {
    id: string;
    marking: string;
  } | null;
  zone: {
    id: string;
    zoneNumber: number;
    distanceFromM: number;
    distanceToM: number;
  } | null;
  charges: ShotConfigurationChargeComponent[];
}
