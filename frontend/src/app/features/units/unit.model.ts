export interface Unit {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  parent?: Unit | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
