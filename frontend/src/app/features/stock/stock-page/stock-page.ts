import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { StockByDepot, StockResource } from '../stock.model';
import { StockService } from '../stock.service';

type ResourceType = 'shells' | 'charges' | 'fuzes' | 'primers';

@Component({
  selector: 'app-stock-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-page.html',
  styleUrl: './stock-page.css',
})
export class StockPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  items: StockByDepot[] = [];
  loading = true;
  refreshing = false;
  errorMessage = '';
  lastSyncLabel = '—';
  searchTerm = '';
  expandedDepotId: string | null = null;
  statsPanelOpen = true;
  selectedResourceType: '' | ResourceType = '';
  pageSkeleton = Array.from({ length: 6 });

  constructor(
    private readonly service: StockService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();

    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'stock'], () => this.load()),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loadSubscription?.unsubscribe();

    if (this.items.length > 0) {
      this.refreshing = true;
    } else {
      this.loading = true;
    }

    this.errorMessage = '';

    this.loadSubscription = this.service.getByDepots().subscribe({
      next: (data) => {
        this.items = data;
        this.loading = false;
        this.refreshing = false;
        this.lastSyncLabel = new Date().toLocaleTimeString('uk-UA', {
          hour: '2-digit',
          minute: '2-digit',
        });
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = this.items.length > 0
          ? 'Залишки БК не вдалося оновити. Показані останні доступні дані.'
          : 'Не вдалося завантажити залишки БК';
        this.loading = false;
        this.refreshing = false;
        this.cdr.detectChanges();
      },
    });
  }

  get hasBlockingError(): boolean {
    return !!this.errorMessage && this.items.length === 0;
  }

  get expandedDepotItem(): StockByDepot | null {
    if (this.expandedDepotId) {
      return this.filteredItems.find((item) => item.depot.id === this.expandedDepotId) ?? null;
    }

    return this.filteredItems[0] ?? null;
  }

  toggleDepot(id: string): void {
    this.expandedDepotId = this.expandedDepotId === id ? null : id;
  }

  toggleStatsPanel(): void {
    this.statsPanelOpen = !this.statsPanelOpen;
  }

  get filteredItems(): StockByDepot[] {
  const term = this.searchTerm.trim().toLowerCase();

  return this.items.filter((item) => {
    const resources = this.selectedResourceType
      ? item[this.selectedResourceType]
      : this.getAllResources(item);

    if (!term) {
      return resources.length > 0;
    }

    return resources.some((resource) =>
      this.safeText(resource.marking).includes(term),
    );
  });
}

  hasAnyStock(item: StockByDepot): boolean {
    return this.getAllResources(item).length > 0;
  }

  getDepotTotal(item: StockByDepot): number {
    return this.getAllResources(item).reduce(
      (sum, resource) => sum + this.safeQuantity(resource.quantity),
      0,
    );
  }

  getTypeTotal(item: StockByDepot, type: ResourceType): number {
    return item[type].reduce(
      (sum, resource) => sum + this.safeQuantity(resource.quantity),
      0,
    );
  }

  getAllResources(item: StockByDepot): StockResource[] {
    return [
      ...item.shells,
      ...item.charges,
      ...item.fuzes,
      ...item.primers,
    ];
  }

getVisibleResources(resources: StockResource[], type: ResourceType): StockResource[] {
  if (this.selectedResourceType && this.selectedResourceType !== type) {
    return [];
  }

  const term = this.searchTerm.trim().toLowerCase();

  if (!term) {
    return resources;
  }

  return resources.filter((resource) =>
    this.safeText(resource.marking).includes(term),
  );
}

  getGlobalTypeTotal(type: ResourceType): number {
    return this.filteredItems.reduce(
      (sum, item) => sum + this.getTypeTotal(item, type),
      0,
    );
  }

  getGlobalTypePositions(type: ResourceType): number {
    return this.filteredItems.reduce(
      (sum, item) => sum + item[type].length,
      0,
    );
  }

  getGlobalTotal(): number {
    return this.filteredItems.reduce(
      (sum, item) => sum + this.getDepotTotal(item),
      0,
    );
  }

  getGlobalDepotsCount(): number {
    return this.filteredItems.filter((item) => this.hasAnyStock(item)).length;
  }

  getTopResources(type: ResourceType): StockResource[] {
  const resources = this.filteredItems.flatMap((item) => item[type]);

  const map = new Map<string, StockResource>();

  for (const resource of resources) {
    const existing = map.get(resource.marking);

    if (existing) {
      existing.quantity = Number(existing.quantity) + this.safeQuantity(resource.quantity);
    } else {
      map.set(resource.marking, {
        ...resource,
        quantity: this.safeQuantity(resource.quantity),
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => Number(b.quantity) - Number(a.quantity))
    .slice(0, 5);
}
safeQuantity(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

private safeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

getDepotTypeLabel(type: string): string {
  if (type === 'main_pas') return 'Головний ПАС';
  if (type === 'division_pas') return 'ПАС дивізіону';
  if (type === 'battery_pas') return 'ПАС батареї';
  if (type === 'fire_position_ammo') return 'БК на ВП';
  return type;
}
}
