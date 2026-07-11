import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../core/auto-refresh.service';
import {
  AMMO_DEPOT_TYPES,
  DRONE_DEPOT_TYPES,
} from '../depots/depot-tree';
import { Depot } from '../depots/depot.model';
import { DepotsService } from '../depots/depots.service';
import {
  DepotInventoryView,
  DepotTreeRow,
  InventoryHistoryItem,
  InventoryItem,
  InventoryResourceType,
  LogisticsMode,
} from './logistics-workspace.model';
import { LogisticsWorkspaceService } from './logistics-workspace.service';

const MODE_RESOURCE_TYPES: Record<
  LogisticsMode,
  readonly InventoryResourceType[]
> = {
  ammunition: ['shell', 'charge', 'fuze', 'primer'],
  drone: ['drone'],
  warhead: ['warhead'],
  all: ['shell', 'charge', 'fuze', 'primer', 'drone', 'warhead'],
};

@Component({
  selector: 'app-logistics-workspace-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './logistics-workspace-page.html',
  styleUrl: './logistics-workspace-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogisticsWorkspacePage implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  private inventorySubscription?: Subscription;
  private historySubscription?: Subscription;

  depots: Depot[] = [];
  inventory: DepotInventoryView | null = null;
  history: InventoryHistoryItem[] = [];

  mode: LogisticsMode = 'ammunition';
  selectedDepotId = '';
  selectedResource: InventoryItem | null = null;

  expandedDepotIds = new Set<string>();
  search = '';
  includeZero = false;

  loadingDepots = true;
  loadingInventory = false;
  loadingHistory = false;
  errorMessage = '';

  constructor(
    private readonly depotsService: DepotsService,
    private readonly workspaceService: LogisticsWorkspaceService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadDepots();

    this.subscriptions.add(
      this.autoRefresh.watch(['stock', 'logistics'], () => {
        this.loadInventory(false);
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.inventorySubscription?.unsubscribe();
    this.historySubscription?.unsubscribe();
  }

  setMode(mode: LogisticsMode): void {
    if (this.mode === mode) {
      return;
    }

    this.mode = mode;
    this.selectedResource = null;
    this.history = [];

    const visible = this.filteredDepots;
    if (!visible.some((depot) => depot.id === this.selectedDepotId)) {
      this.selectedDepotId = visible[0]?.id ?? '';
    }

    this.expandRoots();
    this.loadInventory();
  }

  selectDepot(depot: Depot): void {
    if (this.selectedDepotId === depot.id) {
      return;
    }

    this.selectedDepotId = depot.id;
    this.selectedResource = null;
    this.history = [];
    this.loadInventory();
  }

  toggleDepot(id: string, event: MouseEvent): void {
    event.stopPropagation();

    if (this.expandedDepotIds.has(id)) {
      this.expandedDepotIds.delete(id);
    } else {
      this.expandedDepotIds.add(id);
    }

    this.cdr.markForCheck();
  }

  selectResource(resource: InventoryItem): void {
    this.selectedResource = resource;
    this.loadHistory();
  }

  onIncludeZeroChange(): void {
    this.loadInventory();
  }

  retry(): void {
    this.loadDepots();
  }

  trackDepot(_: number, row: DepotTreeRow<Depot>): string {
    return row.depot.id;
  }

  trackResource(_: number, resource: InventoryItem): string {
    return `${resource.resourceType}:${resource.resourceId}`;
  }

  trackHistory(_: number, item: InventoryHistoryItem): string {
    return item.id;
  }

  get visibleDepotRows(): DepotTreeRow<Depot>[] {
    const depots = this.filteredDepots;
    const idSet = new Set(depots.map((depot) => depot.id));
    const children = new Map<string, Depot[]>();
    const roots: Depot[] = [];

    for (const depot of depots) {
      const parentId =
        depot.parentId && idSet.has(depot.parentId)
          ? depot.parentId
          : '';

      if (!parentId) {
        roots.push(depot);
        continue;
      }

      const bucket = children.get(parentId) ?? [];
      bucket.push(depot);
      children.set(parentId, bucket);
    }

    const sort = (items: Depot[]) =>
      [...items].sort((a, b) => a.name.localeCompare(b.name, 'uk'));

    const rows: DepotTreeRow<Depot>[] = [];

    const visit = (depot: Depot, level: number): void => {
      const nested = sort(children.get(depot.id) ?? []);
      rows.push({
        depot,
        level,
        hasChildren: nested.length > 0,
      });

      if (!this.expandedDepotIds.has(depot.id)) {
        return;
      }

      for (const child of nested) {
        visit(child, level + 1);
      }
    };

    for (const root of sort(roots)) {
      visit(root, 0);
    }

    return rows;
  }

  get selectedDepot(): Depot | null {
    return (
      this.filteredDepots.find(
        (depot) => depot.id === this.selectedDepotId,
      ) ?? null
    );
  }

  get filteredResources(): InventoryItem[] {
    const allowed = new Set(MODE_RESOURCE_TYPES[this.mode]);
    const term = this.search.trim().toLocaleLowerCase('uk');

    return (this.inventory?.resources ?? []).filter((resource) => {
      if (!allowed.has(resource.resourceType)) {
        return false;
      }

      if (!this.includeZero && resource.quantity === 0) {
        return false;
      }

      return (
        !term ||
        resource.name.toLocaleLowerCase('uk').includes(term) ||
        this.resourceTypeLabel(resource.resourceType)
          .toLocaleLowerCase('uk')
          .includes(term)
      );
    });
  }

  get resourceGroups(): Array<{
    key: InventoryItem['category'];
    label: string;
    items: InventoryItem[];
  }> {
    const categories: Array<InventoryItem['category']> = [
      'ammunition',
      'drone',
      'warhead',
    ];

    return categories
      .map((category) => ({
        key: category,
        label: this.categoryLabel(category),
        items: this.filteredResources.filter(
          (item) => item.category === category,
        ),
      }))
      .filter((group) => group.items.length > 0);
  }

  modeLabel(mode: LogisticsMode): string {
    if (mode === 'ammunition') return 'Боєприпаси';
    if (mode === 'drone') return 'БпЛА';
    if (mode === 'warhead') return 'Бойові частини';
    return 'Усі';
  }

  categoryLabel(category: InventoryItem['category']): string {
    if (category === 'ammunition') return 'Боєприпаси';
    if (category === 'drone') return 'БпЛА';
    return 'Бойові частини';
  }

  resourceTypeLabel(type: InventoryResourceType): string {
    if (type === 'shell') return 'Снаряд';
    if (type === 'charge') return 'Заряд';
    if (type === 'fuze') return 'Підривник';
    if (type === 'primer') return 'Капсуль';
    if (type === 'drone') return 'БпЛА';
    return 'Бойова частина';
  }

  accountingUnitLabel(item: InventoryItem): string {
    return item.accountingUnit === 'module' ? 'мод.' : 'шт.';
  }

  depotTypeLabel(type: string): string {
    if (type === 'main_pas') return 'Головний ПАС';
    if (type === 'division_pas') return 'ПАС дивізіону';
    if (type === 'battery_pas') return 'ПАС батареї';
    if (type === 'fire_position_ammo') return 'БК на ВП';
    if (type === 'drone_depot') return 'Склад БпЛА';
    return type;
  }

  movementLabel(type: string | null | undefined): string {
    if (!type) return '—';
    if (type === 'receipt' || type === 'external_supply') {
      return 'Надходження';
    }
    if (type === 'transfer') return 'Передача';
    if (type === 'issue') return 'Видача';
    if (type === 'return') return 'Повернення';
    if (type === 'write_off') return 'Списання';
    if (type === 'correction') return 'Корекція';
    return type;
  }

  historyDate(item: InventoryHistoryItem): string | null {
    return item.movementDatetime ?? item.createdAt ?? null;
  }

  historyDirection(item: InventoryHistoryItem): 'in' | 'out' | 'neutral' {
    const depotId = this.selectedDepotId;

    if (
      item.toDepotId === depotId ||
      item.depotToId === depotId
    ) {
      return 'in';
    }

    if (
      item.fromDepotId === depotId ||
      item.depotFromId === depotId
    ) {
      return 'out';
    }

    return 'neutral';
  }

  signedQuantity(item: InventoryHistoryItem): string {
    const direction = this.historyDirection(item);
    const prefix = direction === 'in' ? '+' : direction === 'out' ? '−' : '';
    return `${prefix}${Number(item.quantity)}`;
  }

  private get filteredDepots(): Depot[] {
    if (this.mode === 'ammunition') {
      return this.depots.filter((depot) =>
        AMMO_DEPOT_TYPES.includes(
          depot.depotType as (typeof AMMO_DEPOT_TYPES)[number],
        ),
      );
    }

    if (this.mode === 'drone' || this.mode === 'warhead') {
      return this.depots.filter((depot) =>
        DRONE_DEPOT_TYPES.includes(
          depot.depotType as (typeof DRONE_DEPOT_TYPES)[number],
        ),
      );
    }

    return this.depots.filter(
      (depot) =>
        AMMO_DEPOT_TYPES.includes(
          depot.depotType as (typeof AMMO_DEPOT_TYPES)[number],
        ) ||
        DRONE_DEPOT_TYPES.includes(
          depot.depotType as (typeof DRONE_DEPOT_TYPES)[number],
        ),
    );
  }

  private loadDepots(): void {
    this.loadingDepots = true;
    this.errorMessage = '';

    this.subscriptions.add(
      this.depotsService.getAll().subscribe({
        next: (depots) => {
          this.depots = depots;

          if (
            !this.filteredDepots.some(
              (depot) => depot.id === this.selectedDepotId,
            )
          ) {
            this.selectedDepotId = this.filteredDepots[0]?.id ?? '';
          }

          this.expandRoots();
          this.loadingDepots = false;
          this.loadInventory();
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.loadingDepots = false;
          this.errorMessage =
            this.errorText(error) || 'Не вдалося завантажити склади';
          this.cdr.markForCheck();
        },
      }),
    );
  }

  private loadInventory(clearSelection = true): void {
    this.inventorySubscription?.unsubscribe();

    if (!this.selectedDepotId) {
      this.inventory = null;
      this.loadingInventory = false;
      this.cdr.markForCheck();
      return;
    }

    this.loadingInventory = true;
    this.errorMessage = '';

    if (clearSelection) {
      this.selectedResource = null;
      this.history = [];
    }

    this.inventorySubscription = this.workspaceService
      .getDepotInventory(this.selectedDepotId, this.includeZero)
      .subscribe({
        next: (inventory) => {
          this.inventory = inventory;
          this.loadingInventory = false;

          if (this.selectedResource) {
            this.selectedResource =
              inventory.resources.find(
                (item) =>
                  item.resourceType ===
                    this.selectedResource?.resourceType &&
                  item.resourceId === this.selectedResource.resourceId,
              ) ?? null;
          }

          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          this.inventory = null;
          this.loadingInventory = false;
          this.errorMessage =
            this.errorText(error) || 'Не вдалося завантажити залишки';
          this.cdr.markForCheck();
        },
      });
  }

  private loadHistory(): void {
    this.historySubscription?.unsubscribe();
    this.history = [];

    if (!this.selectedResource || !this.selectedDepotId) {
      return;
    }

    this.loadingHistory = true;

    this.historySubscription = this.workspaceService
      .getHistory(
        this.selectedDepotId,
        this.selectedResource.resourceType,
        this.selectedResource.resourceId,
      )
      .subscribe({
        next: (history) => {
          this.history = history;
          this.loadingHistory = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.history = [];
          this.loadingHistory = false;
          this.cdr.markForCheck();
        },
      });
  }

  private expandRoots(): void {
    const visibleIds = new Set(this.filteredDepots.map((depot) => depot.id));

    for (const depot of this.filteredDepots) {
      if (!depot.parentId || !visibleIds.has(depot.parentId)) {
        this.expandedDepotIds.add(depot.id);
      }
    }
  }

  private errorText(error: unknown): string {
    const typed = error as {
      error?: { message?: string | string[] };
      message?: string;
    };

    const message = typed.error?.message;

    if (Array.isArray(message)) {
      return message.join('; ');
    }

    return message ?? typed.message ?? '';
  }
}
