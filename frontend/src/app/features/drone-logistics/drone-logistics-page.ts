import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize, forkJoin } from 'rxjs';
import { AutoRefreshService } from '../../core/auto-refresh.service';
import { submitForm } from '../../core/form-submit';
import { AirAssetPosition, DroneCameraType, DroneModel, DroneWarheadType } from '../air-assets/air-asset.model';
import { AirAssetsService } from '../air-assets/air-assets.service';
import { Depot } from '../depots/depot.model';
import { DRONE_DEPOT_TYPES, DepotTreeNode, buildDepotTree } from '../depots/depot-tree';
import { DepotsService } from '../depots/depots.service';
import { Unit } from '../units/unit.model';
import { getUnitName, getUnitsByType } from '../units/unit-tree';
import { UnitsService } from '../units/units.service';
import {
  DroneDepotStock,
  DroneLogisticsService,
  DroneStockMovement,
  WarheadDepotStock,
} from './drone-logistics.service';

type ModalKind = '' | 'depot' | 'model' | 'warhead' | 'add-drone' | 'add-warhead' | 'transfer-drone' | 'transfer-warhead';

@Component({
  selector: 'app-drone-logistics-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './drone-logistics-page.html',
  styleUrl: './drone-logistics-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DroneLogisticsPage implements OnInit, OnDestroy {
  depots: Depot[] = [];
  units: Unit[] = [];
  airAssets: AirAssetPosition[] = [];
  models: DroneModel[] = [];
  warheadTypes: DroneWarheadType[] = [];
  droneStock: DroneDepotStock[] = [];
  warheadStock: WarheadDepotStock[] = [];
  movements: DroneStockMovement[] = [];
  loading = false;
  submitting = false;
  errorMessage = '';
  activeDepotId = '';
  modal: ModalKind = '';
  expandedDepotIds = new Set<string>();
  private readonly subscriptions = new Subscription();

  modelForm = {
  name: '',
  droneGroup: 'recon',
  droneType: 'copter',
  cameraType: 'day',
  maxRangeM: '',
  cruiseSpeedKmh: '',
  enduranceMinutes: '',
  payloadCapacityKg: '',
  maxAltitudeM: '',
  maxWindMs: '',
  note: '',
};
  warheadForm = { name: '', weightKg: '', measureUnit: 'unit' as 'unit' | 'kg', note: '' };
  stockForm = { depotId: '', airAssetPositionId: '', droneModelId: '', warheadTypeId: '', quantity: '1', comment: '' };
  depotForm = { name: '', unitId: '', parentId: '' };

  constructor(
    private readonly service: DroneLogisticsService,
    private readonly depotsService: DepotsService,
    private readonly unitsService: UnitsService,
    private readonly airAssetsService: AirAssetsService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.subscriptions.add(this.autoRefresh.watch(['stock', 'reference', 'map', 'logistics'], () => this.load(false)));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  load(showLoader = true): void {
    this.loading = showLoader;
    this.errorMessage = '';
    this.cdr.markForCheck();
    forkJoin({
      depots: this.depotsService.getAll(),
      units: this.unitsService.getAll(),
      airAssets: this.airAssetsService.getAll(),
      models: this.service.getModels(),
      warheadTypes: this.service.getWarheadTypes(),
      droneStock: this.service.getDepotDroneStock(),
      warheadStock: this.service.getDepotWarheadStock(),
      movements: this.service.getMovements(),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (data) => {
          this.depots = data.depots;
          this.units = data.units;
          this.airAssets = data.airAssets;
          this.models = data.models;
          this.warheadTypes = data.warheadTypes;
          this.droneStock = data.droneStock;
          this.warheadStock = data.warheadStock;
          this.movements = data.movements;
          if (!this.activeDepotId || !this.droneDepots.some((depot) => depot.id === this.activeDepotId)) {
            this.activeDepotId = this.droneDepots[0]?.id || '';
          }
          if (!this.depotForm.unitId && this.availableDepotUnits[0]) this.depotForm.unitId = this.availableDepotUnits[0].id;
          this.prefillStockForm();
          this.cdr.markForCheck();
        },
        error: (error) => this.fail(error),
      });
  }

  get droneDepots(): Depot[] {
    return this.depots.filter((depot) => this.isDroneDepot(depot));
  }

  get selectedDepot(): Depot | null {
    return this.droneDepots.find((depot) => depot.id === this.activeDepotId) || null;
  }

  get depotTree(): DepotTreeNode[] {
    return buildDepotTree(this.droneDepots);
  }

  get isSelectedDroneDepot(): boolean {
    return this.selectedDepot?.depotType === 'drone_depot';
  }

  get filteredDroneStock(): DroneDepotStock[] {
    return this.droneStock.filter((row) => !this.activeDepotId || row.depotId === this.activeDepotId);
  }

  get filteredWarheadStock(): WarheadDepotStock[] {
    return this.warheadStock.filter((row) => !this.activeDepotId || row.depotId === this.activeDepotId);
  }

  get totalDrones(): number {
    return this.filteredDroneStock.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  }

  get totalWarheads(): number {
    return this.filteredWarheadStock.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  }

  get selectedMovements(): DroneStockMovement[] {
    return this.movements
      .filter((item) => item.depotFromId === this.activeDepotId || item.depotToId === this.activeDepotId)
      .slice(0, 12);
  }

  toggleDepot(id: string, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.expandedDepotIds.has(id)) {
      this.expandedDepotIds.delete(id);
    } else {
      this.expandedDepotIds.add(id);
    }
    this.cdr.markForCheck();
  }

  isDepotExpanded(id: string): boolean {
    return this.expandedDepotIds.has(id);
  }

  selectDepot(depot: Depot): void {
    this.activeDepotId = depot.id;
    this.prefillStockForm();
    this.cdr.markForCheck();
  }

  getDepotUnitName(unitId?: string | null): string {
    return getUnitName(this.units, unitId);
  }

  getDepotParentName(parentId?: string | null): string {
    if (!parentId) return '—';
    return this.droneDepots.find((depot) => depot.id === parentId)?.name || '—';
  }

  getDepotTypeLabel(type: string): string {
    if (type === 'main_pas') return 'Головний ПАС';
    if (type === 'division_pas') return 'ПАС дивізіону';
    if (type === 'battery_pas') return 'ПАС батареї';
    if (type === 'fire_position_ammo') return 'БК на ВП';
    if (type === 'drone_depot') return 'Склад БпЛА';
    return type || 'Склад';
  }

  get availableDepotUnits(): Unit[] {
    return getUnitsByType(this.units, ['division', 'battery', 'platoon', 'squad']);
  }

  openModal(kind: ModalKind): void {
    this.modal = kind;
    this.errorMessage = '';
    this.prefillStockForm();
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.modal = '';
    this.cdr.markForCheck();
  }

  saveModel(): void {
    if (!this.modelForm.name.trim()) {
     this.errorMessage = 'Вкажіть назву складу';
      return;
    }
    submitForm(
      this.service.createModel({
  name: this.modelForm.name.trim(),
  droneGroup: this.modelForm.droneGroup,
  droneType: this.modelForm.droneType,
  cameraType: this.modelForm.cameraType as DroneCameraType,
  maxRangeM: this.modelForm.maxRangeM ? Number(this.modelForm.maxRangeM) : null,
  cruiseSpeedKmh: this.modelForm.cruiseSpeedKmh ? Number(this.modelForm.cruiseSpeedKmh) : null,
  enduranceMinutes: this.modelForm.enduranceMinutes ? Number(this.modelForm.enduranceMinutes) : null,
  payloadCapacityKg: this.modelForm.payloadCapacityKg ? Number(this.modelForm.payloadCapacityKg) : null,
  maxAltitudeM: this.modelForm.maxAltitudeM ? Number(this.modelForm.maxAltitudeM) : null,
  maxWindMs: this.modelForm.maxWindMs ? Number(this.modelForm.maxWindMs) : null,
  note: this.modelForm.note.trim() || null,
}),
      {
        begin: () => this.beginSubmitting(),
        success: () => {
         this.modelForm = {
  name: '',
  droneGroup: 'recon',
  droneType: 'copter',
  cameraType: 'day',
  maxRangeM: '',
  cruiseSpeedKmh: '',
  enduranceMinutes: '',
  payloadCapacityKg: '',
  maxAltitudeM: '',
  maxWindMs: '',
  note: '',
};
          this.closeModal();
          this.load();
        },
        fail: (error) => this.fail(error),
        finish: () => this.finishSubmitting(),
      },
    );
  }

  saveWarhead(): void {
    if (!this.warheadForm.name.trim()) {
      this.errorMessage = 'Вкажіть назву БЧ';
      return;
    }
    submitForm(
      this.service.createWarheadType({
        name: this.warheadForm.name.trim(),
        weightKg: this.warheadForm.weightKg ? Number(this.warheadForm.weightKg) : null,
        measureUnit: this.warheadForm.measureUnit,
        note: this.warheadForm.note.trim() || null,
      }),
      {
        begin: () => this.beginSubmitting(),
        success: () => {
          this.warheadForm = { name: '', weightKg: '', measureUnit: 'unit', note: '' };
          this.closeModal();
          this.load();
        },
        fail: (error) => this.fail(error),
        finish: () => this.finishSubmitting(),
      },
    );
  }

  saveDepot(): void {
  this.errorMessage = '';

  const name = this.depotForm.name.trim();

  if (!name) {
    this.errorMessage = 'Вкажіть назву складу';
    return;
  }

  const unitId = this.depotForm.unitId?.trim() || undefined;
  const parentId = this.depotForm.parentId?.trim() || undefined;

  if (unitId && !this.availableDepotUnits.some((unit) => unit.id === unitId)) {
    this.errorMessage = 'Оберіть дивізіон або батарею';
    return;
  }

  submitForm(
    this.depotsService.create({
      name,
      depotType: 'drone_depot',
      ...(unitId ? { unitId } : {}),
      ...(parentId ? { parentId } : {}),
    }),
    {
      begin: () => this.beginSubmitting(),
      success: (depot) => {
        this.depotForm = {
          name: '',
          unitId: this.availableDepotUnits[0]?.id || '',
          parentId: '',
        };
        this.activeDepotId = depot.id;
        this.closeModal();
        this.load();
      },
      fail: (error) => this.fail(error),
      finish: () => this.finishSubmitting(),
    },
  );
}

  addDepotStock(kind: 'drone' | 'warhead'): void {
    const quantity = Number(this.stockForm.quantity);
    if (!this.stockForm.depotId || !this.isDroneDepotId(this.stockForm.depotId) || !this.isValidStockQuantity(kind, quantity, false)) {
      this.errorMessage = 'Вкажіть склад і кількість';
      return;
    }

    if ((kind === 'drone' && !this.stockForm.droneModelId) || (kind === 'warhead' && !this.stockForm.warheadTypeId)) {
      this.errorMessage = 'Вкажіть номенклатуру';
      return;
    }

    if (kind === 'drone') {
      submitForm(
        this.service.addDroneToDepot({
          depotId: this.stockForm.depotId,
          droneModelId: this.stockForm.droneModelId,
          quantity,
          comment: this.stockForm.comment.trim() || undefined,
        }),
        {
          begin: () => this.beginSubmitting(),
          success: () => this.afterStockSaved(),
          fail: (error) => this.fail(error),
          finish: () => this.finishSubmitting(),
        },
      );
      return;
    }

    submitForm(
      this.service.addWarheadToDepot({
        depotId: this.stockForm.depotId,
        warheadTypeId: this.stockForm.warheadTypeId,
        quantity,
        comment: this.stockForm.comment.trim() || undefined,
      }),
      {
        begin: () => this.beginSubmitting(),
        success: () => this.afterStockSaved(),
        fail: (error) => this.fail(error),
        finish: () => this.finishSubmitting(),
      },
    );
  }

  transferStock(kind: 'drone' | 'warhead'): void {
    const quantity = Number(this.stockForm.quantity);
    if (
      !this.stockForm.depotId ||
      !this.isDroneDepotId(this.stockForm.depotId) ||
      !this.stockForm.airAssetPositionId ||
      !this.isValidStockQuantity(kind, quantity, false)
    ) {
      this.errorMessage = 'Вкажіть склад і кількість';
      return;
    }

    if ((kind === 'drone' && !this.stockForm.droneModelId) || (kind === 'warhead' && !this.stockForm.warheadTypeId)) {
      this.errorMessage = 'Вкажіть номенклатуру';
      return;
    }

    const available = this.selectedTransferAvailableQuantity;
    if (available !== null && quantity > available) {
      this.errorMessage = `Недостатньо на складі. Доступно: ${available}`;
      return;
    }

    if (kind === 'drone') {
      submitForm(
        this.service.transferDroneToAirAsset({
          depotId: this.stockForm.depotId,
          airAssetPositionId: this.stockForm.airAssetPositionId,
          droneModelId: this.stockForm.droneModelId,
          quantity,
          comment: this.stockForm.comment.trim() || undefined,
        }),
        {
          begin: () => this.beginSubmitting(),
          success: () => this.afterStockSaved(),
          fail: (error) => this.fail(error),
          finish: () => this.finishSubmitting(),
        },
      );
      return;
    }

    submitForm(
      this.service.transferWarheadToAirAsset({
        depotId: this.stockForm.depotId,
        airAssetPositionId: this.stockForm.airAssetPositionId,
        warheadTypeId: this.stockForm.warheadTypeId,
        quantity,
        comment: this.stockForm.comment.trim() || undefined,
      }),
      {
        begin: () => this.beginSubmitting(),
        success: () => this.afterStockSaved(),
        fail: (error) => this.fail(error),
        finish: () => this.finishSubmitting(),
      },
    );
  }

  getModelName(id: string): string {
    return this.models.find((item) => item.id === id)?.name || 'Борт';
  }

  getWarheadName(id: string): string {
    return this.warheadTypes.find((item) => item.id === id)?.name || 'БЧ';
  }

  getWarheadUnitLabel(type?: DroneWarheadType | null): string {
    return type?.measureUnit === 'kg' ? 'кг' : 'шт';
  }

  getWarheadQuantityLabel(quantity: number | string, type?: DroneWarheadType | null): string {
    const value = Number(quantity || 0);
    const formatted = type?.measureUnit === 'kg' ? value.toFixed(3).replace(/\.?0+$/, '') : String(Math.trunc(value));
    return `${formatted} ${this.getWarheadUnitLabel(type)}`;
  }

  get selectedWarheadType(): DroneWarheadType | null {
    return this.warheadTypes.find((type) => type.id === this.stockForm.warheadTypeId) || null;
  }

  get stockQuantityStep(): string {
    return this.modal.includes('warhead') && this.selectedWarheadType?.measureUnit === 'kg' ? '0.001' : '1';
  }

  get stockQuantityMin(): string {
    return this.modal.includes('warhead') && this.selectedWarheadType?.measureUnit === 'kg' ? '0.001' : '1';
  }

  get selectedTransferAvailableQuantity(): number | null {
    if (!this.modal.includes('transfer') || !this.stockForm.depotId) return null;

    if (this.modal.includes('drone')) {
      return Number(
        this.droneStock.find(
          (row) => row.depotId === this.stockForm.depotId && row.droneModelId === this.stockForm.droneModelId,
        )?.quantity ?? 0,
      );
    }

    return Number(
      this.warheadStock.find(
        (row) => row.depotId === this.stockForm.depotId && row.warheadTypeId === this.stockForm.warheadTypeId,
      )?.quantity ?? 0,
    );
  }

  get isStockSubmitDisabled(): boolean {
    if (this.submitting) return true;
    if (!['add-drone', 'add-warhead', 'transfer-drone', 'transfer-warhead'].includes(this.modal)) return this.submitting;

    const kind: 'drone' | 'warhead' = this.modal.includes('drone') ? 'drone' : 'warhead';
    const quantity = Number(this.stockForm.quantity);
    if (!this.stockForm.depotId || !this.isDroneDepotId(this.stockForm.depotId)) return true;
    if (!this.isValidStockQuantity(kind, quantity, false)) return true;
    if (kind === 'drone' && !this.stockForm.droneModelId) return true;
    if (kind === 'warhead' && !this.stockForm.warheadTypeId) return true;

    if (this.modal.includes('transfer')) {
      if (!this.stockForm.airAssetPositionId) return true;
      const available = this.selectedTransferAvailableQuantity;
      if (available !== null && quantity > available) return true;
    }

    return false;
  }

  prefillStockForm(): void {
    this.stockForm.depotId = this.isSelectedDroneDepot ? this.activeDepotId : this.droneDepots[0]?.id || '';
    this.stockForm.airAssetPositionId = this.stockForm.airAssetPositionId || this.airAssets[0]?.id || '';
    this.stockForm.droneModelId = this.stockForm.droneModelId || this.models[0]?.id || '';
    this.stockForm.warheadTypeId = this.stockForm.warheadTypeId || this.warheadTypes[0]?.id || '';
    this.stockForm.quantity = this.stockForm.quantity || '1';
  }

  private fail(error: any): void {
    this.errorMessage = error?.error?.message || 'Не вдалося зберегти дію';
    this.cdr.markForCheck();
  }

  private afterStockSaved(): void {
    this.closeModal();
    this.load();
  }

  private beginSubmitting(): void {
    this.errorMessage = '';
    this.submitting = true;
    this.cdr.markForCheck();
  }

  private finishSubmitting(): void {
    this.submitting = false;
    this.cdr.markForCheck();
  }

 
  private isValidStockQuantity(kind: 'drone' | 'warhead', quantity: number, allowZero: boolean): boolean {
    const min = allowZero ? 0 : kind === 'warhead' && this.selectedWarheadType?.measureUnit === 'kg' ? 0.001 : 1;
    if (!Number.isFinite(quantity) || quantity < min) {
      return false;
    }

    if (kind === 'drone') {
      return Number.isInteger(quantity);
    }

    return this.selectedWarheadType?.measureUnit === 'kg' || Number.isInteger(quantity);
  }

  private isDroneDepot(depot: Depot): boolean {
    return DRONE_DEPOT_TYPES.includes(depot.depotType as (typeof DRONE_DEPOT_TYPES)[number]);
  }

  private isDroneDepotId(id: string): boolean {
    return this.droneDepots.some((depot) => depot.id === id);
  }
}
