export interface AirThreat {
  id: string;
  threatType: string;
  lat: number;
  lng: number;
  isActive: boolean;
  createdAt: string;
  removedAt: string | null;
}