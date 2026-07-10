import { Unit } from './unit.model';

export type UnitHierarchyType = 'main' | 'division' | 'battery' | 'platoon' | 'squad';

export interface UnitTreeNode {
  unit: Unit;
  children: UnitTreeNode[];
  level: number;
}

const UNIT_TYPE_ORDER: UnitHierarchyType[] = ['main', 'division', 'battery', 'platoon', 'squad'];

export function getUnitName(units: Unit[], unitId?: string | null): string {
  if (!unitId) return 'Невідомий підрозділ';
  return units.find((unit) => unit.id === unitId)?.name || 'Невідомий підрозділ';
}

export function getUnitChildren(units: Unit[], unitId?: string | null): Unit[] {
  return units
    .filter((unit) => unit.parentId === (unitId || null))
    .sort(compareUnits);
}

export function getUnitsByType(units: Unit[], types: UnitHierarchyType | UnitHierarchyType[]): Unit[] {
  const allowedTypes = Array.isArray(types) ? types : [types];
  return units.filter((unit) => allowedTypes.includes(normalizeUnitType(unit))).sort(compareUnits);
}

export function isUnitChildOf(units: Unit[], childId: string, parentId: string): boolean {
  let current = units.find((unit) => unit.id === childId);
  const visited = new Set<string>();

  while (current?.parentId) {
    if (current.parentId === parentId) return true;
    if (visited.has(current.parentId)) return false;
    visited.add(current.parentId);
    current = units.find((unit) => unit.id === current?.parentId);
  }

  return false;
}

export function buildUnitTree(units: Unit[]): UnitTreeNode[] {
  const nodeById = new Map<string, UnitTreeNode>();
  const roots: UnitTreeNode[] = [];

  for (const unit of units) {
    nodeById.set(unit.id, { unit, children: [], level: 0 });
  }

  for (const node of nodeById.values()) {
    const parent = node.unit.parentId ? nodeById.get(node.unit.parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: UnitTreeNode[], level: number): UnitTreeNode[] =>
    nodes
      .sort((a, b) => compareUnits(a.unit, b.unit))
      .map((node) => ({
        ...node,
        level,
        children: sortNodes(node.children, level + 1),
      }));

  return sortNodes(roots, 0);
}

export function normalizeUnitType(unit: Unit): UnitHierarchyType {
  const type = (unit.type || '').trim().toLowerCase();

  if (type === 'main' || type === 'command' || type === 'dnar') return 'main';
  if (type === 'division' || type === 'divizion') return 'division';
  if (type === 'battery') return 'battery';
  if (type === 'platoon') return 'platoon';
  if (type === 'squad') return 'squad';

  if (type.includes('див') || type.includes('дн')) return 'division';
  if (type.includes('бат')) return 'battery';
  if (type.includes('взвод')) return 'platoon';
  if (type.includes('відділ')) return 'squad';

  return unit.parentId ? 'battery' : 'division';
}

export function compareUnits(a: Unit, b: Unit): number {
  const typeDiff = UNIT_TYPE_ORDER.indexOf(normalizeUnitType(a)) - UNIT_TYPE_ORDER.indexOf(normalizeUnitType(b));
  if (typeDiff !== 0) return typeDiff;
  const sortDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (sortDiff !== 0) return sortDiff;
  return a.name.localeCompare(b.name, 'uk');
}
