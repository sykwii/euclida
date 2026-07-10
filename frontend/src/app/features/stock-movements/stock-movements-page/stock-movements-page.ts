import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { Charge } from '../../charges/charge.model';
import { ChargesService } from '../../charges/charges.service';
import { AMMO_DEPOT_TYPES } from '../../depots/depot-tree';
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
type MovementBoardTab = 'active' | 'completed' | 'cancelled' | 'history';

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
  private referencesLoaded = false;
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
  activeTab: MovementBoardTab = 'active';
  searchTerm = '';

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

    this.autoRefreshSubscription.add(this.autoRefresh.watch(['all', 'stock'], () => this.load()));
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
    const referencesRequest = this.referencesLoaded
      ? of({
          depots: this.depots,
          shells: this.shells,
          charges: this.charges,
          fuzes: this.fuzes,
          primers: this.primers,
        })
      : forkJoin({
          depots: this.depotsService.getAll(),
          shells: this.shellsService.getAll(),
          charges: this.chargesService.getAll(),
          fuzes: this.fuzesService.getAll(),
          primers: this.primersService.getAll(),
        });

    this.loadSubscription = forkJoin({
      items: this.service.getGrouped(),
      references: referencesRequest,
      stock: this.stockService.getByDepots(),
    }).subscribe({
      next: ({ items, references, stock }) => {
        this.items = items;
        this.depots = references.depots;
        this.shells = references.shells;
        this.charges = references.charges;
        this.fuzes = references.fuzes;
        this.primers = references.primers;
        this.stockByDepots = stock;
        this.referencesLoaded = true;
        this.currentPage = Math.min(this.currentPage, this.totalPages);
        this.loading = false;
        this.refreshing = false;
        this.cdr.detectChanges();
      },
      error: (error) =>
        this.fail(
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

  get ammoDepots(): Depot[] {
    return this.depots.filter((depot) => this.isAmmoDepot(depot));
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

    const resource = this.getFilteredStock(this.form.fromDepotId, item.itemType).find(
      (candidate) => candidate.id === item.itemId,
    );

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

    if (this.form.fromDepotId && !this.isAmmoDepotId(this.form.fromDepotId)) {
      this.errorMessage = 'Оберіть склад БК або ПАС як відправника';
      return;
    }

    if (this.form.toDepotId && !this.isAmmoDepotId(this.form.toDepotId)) {
      this.errorMessage = 'Оберіть склад БК або ПАС як отримувача';
      return;
    }

    if (
      this.form.fromDepotId &&
      this.form.toDepotId &&
      this.form.fromDepotId === this.form.toDepotId
    ) {
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

    this.service
      .createBatch({
        ...(this.form.fromDepotId ? { fromDepotId: this.form.fromDepotId } : {}),
        ...(this.form.toDepotId ? { toDepotId: this.form.toDepotId } : {}),
        comment: this.form.comment.trim() || undefined,
        items: validItems,
      })
      .subscribe({
        next: () => {
          this.modalSubmitting = false;
          this.resetMovementForm();
          this.closeTransferForm();
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

  private isAmmoDepot(depot: Depot): boolean {
    return AMMO_DEPOT_TYPES.includes(depot.depotType as (typeof AMMO_DEPOT_TYPES)[number]);
  }

  private isAmmoDepotId(id: string): boolean {
    return this.ammoDepots.some((depot) => depot.id === id);
  }

  setActiveTab(tab: MovementBoardTab): void {
    this.activeTab = tab;
    this.currentPage = 1;
    this.expandedGroupId = null;
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
    this.searchTerm = '';
    this.currentPage = 1;
  }

  get activeItems(): StockMovementGroup[] {
    return this.items;
  }

  get completedItems(): StockMovementGroup[] {
    return [];
  }

  get cancelledItems(): StockMovementGroup[] {
    return [];
  }

  get historyItems(): StockMovementGroup[] {
    return this.items;
  }

  get tabItems(): StockMovementGroup[] {
    if (this.activeTab === 'completed') return this.completedItems;
    if (this.activeTab === 'cancelled') return this.cancelledItems;
    if (this.activeTab === 'history') return this.historyItems;
    return this.activeItems;
  }

  get filteredItems(): StockMovementGroup[] {
    const search = this.searchTerm.trim().toLowerCase();

    return this.tabItems.filter((group) => {
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

      if (!search) return true;

      const haystack = [
        group.documentNumber,
        group.fromDepot?.name,
        group.toDepot?.name,
        group.comment,
        ...group.items.flatMap((item) => [
          this.getItemTypeLabel(item.itemType),
          this.getResourceName(item.itemType, item.itemId),
          String(item.quantity),
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(search);
    });
  }

  get emptyStateTitle(): string {
    if (this.activeTab === 'completed') return 'Завершені передачі не ведуться окремо';
    if (this.activeTab === 'cancelled') return 'Скасованих передач немає';
    if (this.activeTab === 'history') return 'Історія передач БК відсутня';
    return 'Документи передачі відсутні';
  }

  get emptyStateHint(): string {
    if (this.activeTab === 'completed') {
      return 'У поточній моделі даних немає окремого статусу завершення. Проведені документи дивись у вкладці Історія.';
    }

    if (this.activeTab === 'cancelled') {
      return 'Коли для передач БК зʼявиться статус скасування, такі документи будуть зібрані тут.';
    }

    if (this.searchTerm || Object.values(this.filters).some(Boolean)) {
      return 'Зміни пошук або скинь фільтри, щоб побачити всі документи.';
    }

    return 'Після першої передачі БК історія зʼявиться тут.';
  }

  getGroupStatusLabel(): string {
    if (this.activeTab === 'history') return 'проведено';
    if (this.activeTab === 'completed') return 'завершено';
    if (this.activeTab === 'cancelled') return 'скасовано';
    return 'в роботі';
  }

  getGroupStatusClass(): string {
    if (this.activeTab === 'history' || this.activeTab === 'completed') return 'done';
    if (this.activeTab === 'cancelled') return 'cancelled';
    return 'in-progress';
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
