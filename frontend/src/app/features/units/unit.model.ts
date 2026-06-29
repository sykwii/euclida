export interface Unit {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}