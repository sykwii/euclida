import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { StockMovement } from '../../stock-movements/stock-movement.model';
import { StockMovementsService } from '../../stock-movements/stock-movements.service';
import { StockByDepot, StockResource } from '../../stock/stock.model';
import { StockService } from '../../stock/stock.service';
import { Unit } from '../../units/unit.model';
import { getUnitName, getUnitsByType } from '../../units/unit-tree';
import { UnitsService } from '../../units/units.service';
import { AMMO_DEPOT_TYPES, DepotTreeNode, buildDepotTree } from '../depot-tree';
import { Depot } from '../depot.model';
import { DepotsService } from '../depots.service';

@Component({
  selector: 'app-depots-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './depots-page.html',
  styleUrl: './depots-page.css',
})
export class DepotsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;

  items: Depot[] = [];
  units: Unit[] = [];
  stockItems: StockByDepot[] = [];
  movements: StockMovement[] = [];
  loading = true;
  errorMessage = '';
  activeDepotId = '';
  expandedDepotIds = new Set<string>();

  form = {
    name: '',
    depotType: 'main_pas',
    unitId: '',
    parentId: '',
  };

  constructor(
    private readonly service: DepotsService,
    private readonly stockService: StockService,
    private readonly movementsService: StockMovementsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['stock'], () => this.load()));
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loadSubscription?.unsubscribe();
    this.loading = true;
    this.errorMessage = '';

    this.loadSubscription = forkJoin({
      depots: this.service.getAll(),
      units: this.unitsService.getAll(),
      stockItems: this.stockService.getByDepots(),
      movements: this.movementsService.getAll(),
    }).subscribe({
      next: ({ depots, units, stockItems, movements }) => {
        this.items = depots;
        this.units = units;
        this.stockItems = stockItems;
        this.movements = movements;
        if (!this.activeDepotId || !this.ammoDepots.some((depot) => depot.id === this.activeDepotId)) {
          this.activeDepotId = this.ammoDepots[0]?.id || '';
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося завантажити склади'),
    });
  }

  create(): void {
    this.errorMessage = '';

    if (!this.form.name.trim()) {
      this.errorMessage = 'Вкажіть назву складу';
      return;
    }

    if (!AMMO_DEPOT_TYPES.includes(this.form.depotType as (typeof AMMO_DEPOT_TYPES)[number])) {
      this.errorMessage = 'Оберіть склад БК або ПАС';
      return;
    }

    const unitId = this.normalizeSelectedUnitId(this.form.unitId);
    const parentId = this.normalizeSelectedDepotId(this.form.parentId);
    if (this.depotNeedsUnit && !unitId) {
      this.errorMessage = 'Оберіть коректний підрозділ для складу';
      return;
    }
    if (this.form.unitId && !unitId) {
      this.errorMessage = 'Оберіть підрозділ зі списку';
      return;
    }
    if (this.form.parentId && !parentId) {
      this.errorMessage = 'Оберіть батьківський склад зі списку';
      return;
    }

    this.service
      .create({
        name: this.form.name.trim(),
        depotType: this.form.depotType,
        ...(unitId ? { unitId } : {}),
        ...(parentId ? { parentId } : {}),
      })
      .subscribe({
        next: () => {
          this.form = { name: '', depotType: 'main_pas', unitId: '', parentId: '' };
          this.load();
        },
        error: (error) => this.fail(error, error?.error?.message || 'Не вдалося створити склад'),
      });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити склад'),
    });
  }

  get depotTree(): DepotTreeNode[] {
    return buildDepotTree(this.ammoDepots);
  }

  get selectedDepot(): Depot | null {
    return this.ammoDepots.find((depot) => depot.id === this.activeDepotId) || null;
  }

  get ammoDepots(): Depot[] {
    return this.items.filter((depot) => this.isAmmoDepot(depot));
  }

  get selectedStock(): StockByDepot | null {
    return this.stockItems.find((item) => item.depot.id === this.activeDepotId) || null;
  }

  get selectedShells(): StockResource[] {
    return this.selectedStock?.shells || [];
  }

  get selectedCharges(): StockResource[] {
    return this.selectedStock?.charges || [];
  }

  get selectedFuzes(): StockResource[] {
    return this.selectedStock?.fuzes || [];
  }

  get selectedPrimers(): StockResource[] {
    return this.selectedStock?.primers || [];
  }

  get selectedMovements(): StockMovement[] {
    return this.movements
      .filter((movement) => movement.fromDepotId === this.activeDepotId || movement.toDepotId === this.activeDepotId)
      .slice(0, 12);
  }

  toggleDepot(id: string, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.expandedDepotIds.has(id)) {
      this.expandedDepotIds.delete(id);
    } else {
      this.expandedDepotIds.add(id);
    }
    this.cdr.detectChanges();
  }

  isDepotExpanded(id: string): boolean {
    return this.expandedDepotIds.has(id);
  }

  selectDepot(depot: Depot): void {
    this.activeDepotId = depot.id;
    this.cdr.detectChanges();
  }

  getDepotUnitName(unitId?: string | null): string {
    return getUnitName(this.units, unitId);
  }

  getDepotParentName(parentId?: string | null): string {
    if (!parentId) return '—';
    return this.ammoDepots.find((depot) => depot.id === parentId)?.name || '—';
  }

  getDepotTypeLabel(type: string): string {
    if (type === 'main_pas') return 'Головний ПАС';
    if (type === 'division_pas') return 'ПАС дивізіону';
    if (type === 'battery_pas') return 'ПАС батареї';
    if (type === 'fire_position_ammo') return 'БК на ВП';
    if (type === 'drone_depot') return 'Склад БпЛА';
    return type;
  }

  getMovementDirection(movement: StockMovement): string {
    if (movement.toDepotId === this.activeDepotId && movement.fromDepotId) return 'Надійшло';
    if (movement.fromDepotId === this.activeDepotId && movement.toDepotId) return 'Передано';
    if (movement.toDepotId === this.activeDepotId) return 'Поповнення';
    return movement.movementType;
  }

  get availableUnits(): Unit[] {
    if (this.form.depotType === 'division_pas') return getUnitsByType(this.units, 'division');
    if (this.form.depotType === 'battery_pas') return getUnitsByType(this.units, 'battery');
    if (this.form.depotType === 'fire_position_ammo') return getUnitsByType(this.units, ['battery', 'platoon', 'squad']);
    return [];
  }

  get depotNeedsUnit(): boolean {
    return ['division_pas', 'battery_pas', 'fire_position_ammo'].includes(this.form.depotType);
  }

  onDepotTypeChange(): void {
    if (this.form.unitId && !this.availableUnits.some((unit) => unit.id === this.form.unitId)) {
      this.form.unitId = '';
    }
  }

  private normalizeSelectedUnitId(value: string): string | null {
    const candidate = (value || '').trim();
    if (!this.isUuid(candidate)) return null;
    return this.availableUnits.some((unit) => unit.id === candidate) ? candidate : null;
  }

  private normalizeSelectedDepotId(value: string): string | null {
    const candidate = (value || '').trim();
    if (!this.isUuid(candidate)) return null;
    return this.ammoDepots.some((depot) => depot.id === candidate) ? candidate : null;
  }

  private isAmmoDepot(depot: Depot): boolean {
    return AMMO_DEPOT_TYPES.includes(depot.depotType as (typeof AMMO_DEPOT_TYPES)[number]);
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private fail(error: unknown, message: string): void {
    this.errorMessage = message;
    this.loading = false;
    this.cdr.detectChanges();
  }
}
