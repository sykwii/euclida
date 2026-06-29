import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { Charge } from '../../charges/charge.model';
import { ChargesService } from '../../charges/charges.service';
import { Depot } from '../../depots/depot.model';
import { DepotsService } from '../../depots/depots.service';
import { Fuze } from '../../fuzes/fuze.model';
import { FuzesService } from '../../fuzes/fuzes.service';
import { Primer } from '../../primers/primer.model';
import { PrimersService } from '../../primers/primers.service';
import { Shell } from '../../shells/shell.model';
import { ShellsService } from '../../shells/shells.service';
import { StockByDepot, StockResource } from '../../stock/stock.model';
import { StockService } from '../../stock/stock.service';
import { StockMovementGroup } from '../stock-movement.model';
import { StockMovementsService } from '../stock-movements.service';

type ResourceOption = { id: string; marking: string };
type MovementFormItem = { itemType: string; itemId: string; quantity: number };

@Component({
  selector: 'app-stock-movements-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './stock-movements-page.html',
  styleUrl: './stock-movements-page.css',
})
export class StockMovementsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  items: StockMovementGroup[] = [];
  depots: Depot[] = [];
  shells: Shell[] = [];
  charges: Charge[] = [];
  fuzes: Fuze[] = [];
  primers: Primer[] = [];
  stockByDepots: StockByDepot[] = [];

  loading = true;
  refreshing = false;
  errorMessage = '';
  transferFormOpen = false;
  modalSubmitting = false;

filterVisible = false;

currentPage = 1;
pageSize = 50;

filters = {
  dateFrom: '',
  dateTo: '',
  fromDepotId: '',
  toDepotId: '',
  movementKind: '',
};

  form = {
    fromDepotId: '',
    toDepotId: '',
    comment: '',
    items: [{ itemType: 'shell', itemId: '', quantity: 1 }] as MovementFormItem[],
  };

  expandedGroupId: string | null = null;

  constructor(
    private readonly service: StockMovementsService,
    private readonly depotsService: DepotsService,
    private readonly shellsService: ShellsService,
    private readonly chargesService: ChargesService,
    private readonly fuzesService: FuzesService,
    private readonly primersService: PrimersService,
    private readonly stockService: StockService,
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

    this.loadSubscription = forkJoin({
      items: this.service.getGrouped(),
      depots: this.depotsService.getAll(),
      shells: this.shellsService.getAll(),
      charges: this.chargesService.getAll(),
      fuzes: this.fuzesService.getAll(),
      primers: this.primersService.getAll(),
      stock: this.stockService.getByDepots(),
    }).subscribe({
      next: ({ items, depots, shells, charges, fuzes, primers, stock }) => {
        this.items = items;
        this.depots = depots;
        this.shells = shells;
        this.charges = charges;
        this.fuzes = fuzes;
        this.primers = primers;
        this.stockByDepots = stock;
        this.currentPage = Math.min(this.currentPage, this.totalPages);
        this.loading = false;
        this.refreshing = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(
        error,
        this.items.length > 0
          ? 'Передачі БК не вдалося оновити. Показані останні доступні дані.'
          : 'Не вдалося завантажити передачі БК',
      ),
    });
  }

  addItem(): void {
    if (this.modalSubmitting) return;
    this.form.items.push({ itemType: 'shell', itemId: '', quantity: 1 });
  }

  removeItem(index: number): void {
    if (this.modalSubmitting || this.form.items.length === 1) return;
    this.form.items.splice(index, 1);
  }

  onItemTypeChange(item: MovementFormItem): void {
    item.itemId = '';
  }

  getSelectedResources(itemType: string): ResourceOption[] {
    if (this.form.fromDepotId) {
      return this.getFilteredStock(this.form.fromDepotId, itemType)
        .filter((resource) => Number(resource.quantity) > 0)
        .map((resource) => ({
          id: resource.id,
          marking: `${resource.marking} · доступно ${resource.quantity}`,
        }));
    }

    if (itemType === 'shell') return this.shells;
    if (itemType === 'charge') return this.charges;
    if (itemType === 'fuze') return this.fuzes;
    if (itemType === 'primer') return this.primers;
    return [];
  }

  getResourceName(itemType: string, itemId: string): string {
    if (itemType === 'shell') return this.shells.find((x) => x.id === itemId)?.marking || itemId;
    if (itemType === 'charge') return this.charges.find((x) => x.id === itemId)?.marking || itemId;
    if (itemType === 'fuze') return this.fuzes.find((x) => x.id === itemId)?.marking || itemId;
    if (itemType === 'primer') return this.primers.find((x) => x.id === itemId)?.marking || itemId;
    return itemId;
  }

  getItemTypeLabel(itemType: string): string {
    if (itemType === 'shell') return 'Снаряд';
    if (itemType === 'charge') return 'Заряд';
    if (itemType === 'fuze') return 'Підривники';
    if (itemType === 'primer') return 'Праймери';
    return itemType;
  }

  getDepotStock(depotId: string): StockByDepot | null {
    return this.stockByDepots.find((item) => item.depot.id === depotId) || null;
  }

  getFilteredStock(depotId: string, itemType: string): StockResource[] {
    const stock = this.getDepotStock(depotId);
    if (!stock) return [];

    if (itemType === 'shell') return stock.shells;
    if (itemType === 'charge') return stock.charges;
    if (itemType === 'fuze') return stock.fuzes;
    if (itemType === 'primer') return stock.primers;

    return [];
  }

  getSelectedItemTypes(): string[] {
    return Array.from(new Set(this.form.items.map((item) => item.itemType)));
  }

  getAvailableQuantity(item: MovementFormItem): number {
    if (!this.form.fromDepotId || !item.itemId) {
      return Number.POSITIVE_INFINITY;
    }

    const resource = this
      .getFilteredStock(this.form.fromDepotId, item.itemType)
      .find((candidate) => candidate.id === item.itemId);

    return Number(resource?.quantity ?? 0);
  }

  isQuantityTooLarge(item: MovementFormItem): boolean {
    return Number(item.quantity) > this.getAvailableQuantity(item);
  }

  getPositiveStock(depotId: string, itemType: string): StockResource[] {
    return this.getFilteredStock(depotId, itemType).filter(
      (resource) => Number(resource.quantity) > 0,
    );
  }

  openTransferForm(): void {
    this.errorMessage = '';
    this.transferFormOpen = true;
  }

  closeTransferForm(): void {
    if (this.modalSubmitting) return;
    this.transferFormOpen = false;
  }

  onModalBackdropClick(): void {
    this.closeTransferForm();
  }

  onModalCardClick(event: MouseEvent): void {
    event.stopPropagation();
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.transferFormOpen) {
      this.closeTransferForm();
    }
  }

  resetMovementForm(): void {
    this.form = {
      fromDepotId: '',
      toDepotId: '',
      comment: '',
      items: [{ itemType: 'shell', itemId: '', quantity: 1 }],
    };
  }

  onFromDepotChanged(): void {
    this.validateRoute();

    for (const item of this.form.items) {
      item.itemId = '';
    }
  }

  onToDepotChanged(): void {
    this.validateRoute();
  }

  private validateRoute(): void {
    this.errorMessage = '';

    if (this.form.fromDepotId && this.form.fromDepotId === this.form.toDepotId) {
      this.errorMessage = 'Склад-відправник і склад-отримувач не можуть бути однаковими';
    }
  }

  create(): void {
    if (this.modalSubmitting) return;
    this.errorMessage = '';

    if (!this.form.fromDepotId && !this.form.toDepotId) {
      this.errorMessage = 'Оберіть склад-відправник або склад-отримувач';
      return;
    }

    if (this.form.fromDepotId && this.form.toDepotId && this.form.fromDepotId === this.form.toDepotId) {
      this.errorMessage = 'Склад-відправник і склад-отримувач не можуть бути однаковими';
      return;
    }

    const validItems = this.form.items
      .filter((item) => item.itemId && Number(item.quantity) > 0)
      .map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        quantity: Number(item.quantity),
      }));

    if (validItems.length === 0) {
      this.errorMessage = 'Додайте хоча б один ресурс';
      return;
    }

    if (this.form.fromDepotId) {
      for (const item of this.form.items) {
        if (item.itemId && this.isQuantityTooLarge(item)) {
          const available = this.getAvailableQuantity(item);
          this.errorMessage = `Недостатньо ресурсу. Доступно: ${available}, потрібно: ${item.quantity}`;
          return;
        }
      }
    }

    this.modalSubmitting = true;

    this.service.createBatch({
      ...(this.form.fromDepotId ? { fromDepotId: this.form.fromDepotId } : {}),
      ...(this.form.toDepotId ? { toDepotId: this.form.toDepotId } : {}),
      comment: this.form.comment.trim() || undefined,
      items: validItems,
    }).subscribe({
      next: () => {
        this.modalSubmitting = false;
        this.resetMovementForm();
        this.transferFormOpen = false;
        this.load();
      },
      error: (error) => {
        this.modalSubmitting = false;
        this.fail(error, error?.error?.message || 'Не вдалося створити передачу');
      },
    });
  }

  toggleGroup(groupId: string): void {
    this.expandedGroupId = this.expandedGroupId === groupId ? null : groupId;
  }

  private fail(_error: unknown, message: string): void {
    this.errorMessage = message;
    this.loading = false;
    this.refreshing = false;
    this.cdr.detectChanges();
  }
  
toggleFilter(): void {
  this.filterVisible = !this.filterVisible;
}

onFiltersChanged(): void {
  this.currentPage = 1;
}

resetFilters(): void {
  this.filters = {
    dateFrom: '',
    dateTo: '',
    fromDepotId: '',
    toDepotId: '',
    movementKind: '',
  
  };
    this.currentPage = 1;
}

get filteredItems(): StockMovementGroup[] {
  return this.items.filter((group) => {
    const date = new Date(group.movementDatetime);

    if (this.filters.dateFrom) {
      const from = new Date(this.filters.dateFrom);
      if (date < from) return false;
    }

    if (this.filters.dateTo) {
      const to = new Date(this.filters.dateTo);
      to.setHours(23, 59, 59, 999);
      if (date > to) return false;
    }

    if (this.filters.fromDepotId && group.fromDepot?.id !== this.filters.fromDepotId) {
      return false;
    }

    if (this.filters.toDepotId && group.toDepot?.id !== this.filters.toDepotId) {
      return false;
    }

    if (this.filters.movementKind === 'external' && group.fromDepot) {
      return false;
    }

    if (this.filters.movementKind === 'internal' && !group.fromDepot) {
      return false;
    }

    return true;
  });
}

get totalPages(): number {
  return Math.max(1, Math.ceil(this.filteredItems.length / this.pageSize));
}

get pagedItems(): StockMovementGroup[] {
  const safePage = Math.min(Math.max(this.currentPage, 1), this.totalPages);
  const start = (safePage - 1) * this.pageSize;
  return this.filteredItems.slice(start, start + this.pageSize);
}

goToPage(page: number): void {
  this.currentPage = Math.min(Math.max(page, 1), this.totalPages);
}

}
