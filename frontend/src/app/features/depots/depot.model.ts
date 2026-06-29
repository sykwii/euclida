export interface Unit {
  id: string;
  name: string;
  type: string;
}

export interface Depot {
  id: string;
  name: string;
  depotType: string;
  unitId: string | null;
  unit?: Unit | null;
  parentId: string | null;
  parent?: Depot | null;
  lat: number | null;
  lng: number | null;
  mgrs: string | null;
  createdAt: string;
  updatedAt: string;
}