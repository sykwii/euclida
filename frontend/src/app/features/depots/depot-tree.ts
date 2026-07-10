import { Depot } from './depot.model';

export interface DepotTreeNode {
  depot: Depot;
  children: DepotTreeNode[];
  level: number;
}

export const AMMO_DEPOT_TYPES = ['main_pas', 'division_pas', 'battery_pas', 'fire_position_ammo'] as const;
export const DRONE_DEPOT_TYPES = ['drone_depot'] as const;

const DEPOT_TYPE_ORDER: readonly string[] = [...AMMO_DEPOT_TYPES, ...DRONE_DEPOT_TYPES];

export function buildDepotTree(depots: Depot[]): DepotTreeNode[] {
  const nodeById = new Map<string, DepotTreeNode>();
  const roots: DepotTreeNode[] = [];

  for (const depot of depots) {
    nodeById.set(depot.id, { depot, children: [], level: 0 });
  }

  for (const node of nodeById.values()) {
    const parentId = node.depot.parentId || '';
    const parent = parentId ? nodeById.get(parentId) : null;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: DepotTreeNode[], level: number): DepotTreeNode[] =>
    nodes
      .sort(compareDepotNodes)
      .map((node) => ({
        ...node,
        level,
        children: sortNodes(node.children, level + 1),
      }));

  return sortNodes(roots, 0);
}

function compareDepotNodes(a: DepotTreeNode, b: DepotTreeNode): number {
  const typeDiff = getDepotTypeRank(a.depot.depotType) - getDepotTypeRank(b.depot.depotType);
  if (typeDiff !== 0) return typeDiff;
  return a.depot.name.localeCompare(b.depot.name, 'uk');
}

function getDepotTypeRank(type: string): number {
  const index = DEPOT_TYPE_ORDER.indexOf(type);
  return index === -1 ? DEPOT_TYPE_ORDER.length : index;
}
