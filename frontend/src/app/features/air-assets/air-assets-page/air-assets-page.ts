import '@angular/compiler';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, catchError, forkJoin, of } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { Unit } from '../../units/unit.model';
import { getUnitsByType } from '../../units/unit-tree';
import { UnitsService } from '../../units/units.service';
import { DroneDepotStock, DroneLogisticsService } from '../../drone-logistics/drone-logistics.service';
import {
  AirAssetDroneStock,
  AirAssetGroup,
  AirAssetPosition,
  AirAssetTask,
  AirAssetTaskStatus,
  AirAssetTaskType,
  AirAssetWarheadStock,
  AirCombatType,
  AirReadinessStatus,
  AirReconArea,
  AirReconAreaStatus,
  AirReconType,
  CreateAirAssetPositionRequest,
  DroneModel,
  DroneWarheadType,
  UpsertAirAssetTaskRequest,
} from '../air-asset.model';
import { AirAssetsService } from '../air-assets.service';

type CoordinateMode = 'decimal' | 'mgrs';

type ReconPointForm = {
  lat: string;
  lng: string;
};

type AirAssetForm = {
  name: string;
  unitId: string;
  callsign: string;
  assetGroup: AirAssetGroup;
  reconType: AirReconType;
  combatType: AirCombatType;
  coordinateMode: CoordinateMode;
  lat: string;
  lng: string;
  mgrs: string;
  readinessStatus: AirReadinessStatus;
  notReadyReason: string;
  personnelRotationDate: string;
  assetName: string;
  droneModel: string;
  sourceDroneStockKey: string;
  sourceDroneQuantity: string;
  mainDirectionUnits: string;
  traverseLeftUnits: string;
  traverseRightUnits: string;
  maxSectorDistanceM: string;
  reconAreaName: string;
  reconAreaActiveDate: string;
  reconAreaNote: string;
  reconAreaPoints: ReconPointForm[];
  note: string;
};

type PositionStock = {
  drones: AirAssetDroneStock[];
  warheads: AirAssetWarheadStock[];
};

type StockCorrectionForm = {
  droneModelId: string;
  droneQuantity: string;
  warheadTypeId: string;
  warheadQuantity: string;
  comment: string;
};

type ReconAreaForm = {
  id: string | null;
  name: string;
  activeDate: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status: AirReconAreaStatus;
  note: string;
  points: ReconPointForm[];
};

type AirTaskForm = {
  id: string | null;
  taskType: AirAssetTaskType;
  name: string;
  airAssetPositionId: string;
  droneModelId: string;
  warheadTypeId: string;
  areaName: string;
  plannedStartAt: string;
  plannedEndAt: string;
  status: AirAssetTaskStatus;
  note: string;
  points: ReconPointForm[];
};

@Component({
  selector: 'app-air-assets-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './air-assets-page.html',
  styleUrl: './air-assets-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AirAssetsPage implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  items: AirAssetPosition[] = [];
  tasks: AirAssetTask[] = [];
  units: Unit[] = [];
  loading = true;
  errorMessage = '';
  editingId: string | null = null;
  formModalOpen = false;
  detailsItem: AirAssetPosition | null = null;
  stockModalItem: AirAssetPosition | null = null;
  reconModalItem: AirAssetPosition | null = null;
  taskModalOpen = false;
  activeGroup: 'all' | AirAssetGroup = 'all';
  form: AirAssetForm = this.getEmptyForm();
  stockByAsset: Record<string, PositionStock> = {};
  droneModels: DroneModel[] = [];
  warheadTypes: DroneWarheadType[] = [];
  depotDroneStock: DroneDepotStock[] = [];
  stockForm: StockCorrectionForm = this.getEmptyStockForm();
  reconForm: ReconAreaForm = this.getEmptyReconAreaForm();
  taskForm: AirTaskForm = this.getEmptyTaskForm();

  constructor(
    private readonly service: AirAssetsService,
    private readonly droneLogistics: DroneLogisticsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.load();
    this.subscriptions.add(this.route.queryParamMap.subscribe((params) => {
      if (params.get('restoreReconArea') === 'true') {
        this.restoreReconAreaDraft();
      }
    }));
    this.subscriptions.add(this.autoRefresh.watch(['all', 'map', 'missions'], () => this.load()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get filteredItems(): AirAssetPosition[] {
    if (this.activeGroup === 'all') return this.items;
    return this.items.filter((item) => item.assetGroup === this.activeGroup);
  }

  get reconCount(): number {
    return this.items.filter((item) => item.assetGroup === 'recon').length;
  }

  get combatCount(): number {
    return this.items.filter((item) => item.assetGroup === 'combat').length;
  }

  get readyCount(): number {
    return this.items.filter((item) => item.readinessStatus === 'ready').length;
  }

  get activeTaskCount(): number {
    return this.tasks.filter((task) => !['completed', 'cancelled'].includes(task.status)).length;
  }

  get taskAsset(): AirAssetPosition | null {
    return this.items.find((item) => item.id === this.taskForm.airAssetPositionId) || null;
  }

  get taskAvailableDrones(): AirAssetDroneStock[] {
    const asset = this.taskAsset;
    return asset ? this.getStock(asset).drones.filter((row) => row.quantity > 0) : [];
  }

  get taskAvailableWarheads(): AirAssetWarheadStock[] {
    const asset = this.taskAsset;
    return asset ? this.getStock(asset).warheads.filter((row) => row.quantity > 0) : [];
  }

  get availableUnits(): Unit[] {
    return getUnitsByType(this.units, ['division', 'battery', 'platoon', 'squad']);
  }

  get availableReconDepotDrones(): DroneDepotStock[] {
    return this.depotDroneStock
      .filter((row) => row.quantity > 0)
      .sort((a, b) => (a.droneModel?.name || '').localeCompare(b.droneModel?.name || ''));
  }

  get selectedReconDepotStock(): DroneDepotStock | null {
    return this.availableReconDepotDrones.find((row) => this.getDepotDroneKey(row) === this.form.sourceDroneStockKey) || null;
  }

  get selectedReconStockMaxQuantity(): number {
    return this.selectedReconDepotStock?.quantity || 0;
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      items: this.service.getAll(),
      tasks: this.service.getTasks().pipe(catchError(() => of([]))),
      units: this.unitsService.getAll(),
      droneModels: this.service.getDroneModels().pipe(catchError(() => of([]))),
      warheadTypes: this.service.getWarheadTypes().pipe(catchError(() => of([]))),
      depotDroneStock: this.droneLogistics.getDepotDroneStock().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ items, tasks, units, droneModels, warheadTypes, depotDroneStock }) => {
        this.items = items;
        this.tasks = tasks;
        this.units = units;
        this.droneModels = droneModels;
        this.warheadTypes = warheadTypes;
        this.depotDroneStock = depotDroneStock;
        this.syncOpenAssetReferences(items);
        this.loadStocks(items);
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити повітряні розрахунки'),
    });
  }

  setGroup(group: 'all' | AirAssetGroup): void {
    this.activeGroup = group;
  }

  openCreate(group: AirAssetGroup = 'recon'): void {
    this.editingId = null;
    this.form = this.getEmptyForm(group);
    this.formModalOpen = true;
  }

  startEdit(item: AirAssetPosition): void {
    const activeArea = item.reconAreas?.[0];

    this.editingId = item.id;
    this.form = {
      name: item.name,
      unitId: item.unitId,
      callsign: item.callsign,
      assetGroup: item.assetGroup,
      reconType: item.reconType === 'fixed_wing' ? 'fixed_wing' : 'copter',
      combatType: this.normalizeCombatType(item.combatType),
      coordinateMode: 'decimal',
      lat: String(item.lat ?? ''),
      lng: String(item.lng ?? ''),
      mgrs: item.mgrs ?? '',
      readinessStatus: item.readinessStatus === 'not_ready' ? 'not_ready' : 'ready',
      notReadyReason: item.notReadyReason ?? '',
      personnelRotationDate: item.personnelRotationDate ? item.personnelRotationDate.slice(0, 10) : '',
      assetName: item.assetName ?? '',
      droneModel: item.droneModel ?? '',
      sourceDroneStockKey: '',
      sourceDroneQuantity: '1',
      mainDirectionUnits: item.mainDirectionUnits !== null && item.mainDirectionUnits !== undefined ? String(item.mainDirectionUnits) : '',
      traverseLeftUnits: item.traverseLeftUnits !== null && item.traverseLeftUnits !== undefined ? String(item.traverseLeftUnits) : '',
      traverseRightUnits: item.traverseRightUnits !== null && item.traverseRightUnits !== undefined ? String(item.traverseRightUnits) : '',
      maxSectorDistanceM: item.maxSectorDistanceM !== null && item.maxSectorDistanceM !== undefined ? String(item.maxSectorDistanceM) : '',
      reconAreaName: activeArea?.name ?? '',
      reconAreaActiveDate: activeArea?.activeDate ? activeArea.activeDate.slice(0, 10) : this.today(),
      reconAreaNote: activeArea?.note ?? '',
      reconAreaPoints: activeArea?.points?.length
        ? [...activeArea.points]
            .sort((a, b) => (a.pointOrder ?? 0) - (b.pointOrder ?? 0))
            .map((point) => ({ lat: String(point.lat), lng: String(point.lng) }))
        : this.getDefaultReconPoints(),
      note: item.note ?? '',
    };

    this.formModalOpen = true;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.formModalOpen = false;
    this.form = this.getEmptyForm();
  }

  save(): void {
    this.errorMessage = '';
    const body = this.buildRequestBody();
    if (!body) return;

    const transfer = this.getReconStockTransfer();
    if (this.form.assetGroup === 'recon' && !this.editingId && !transfer) return;
    const editingId = this.editingId;
    const request = this.editingId
      ? this.service.update(this.editingId, body)
      : this.service.create(body);

    request.subscribe({
      next: (saved) => {
        if (!editingId && transfer) {
          this.droneLogistics.transferDroneToAirAsset({
            depotId: transfer.depotId,
            airAssetPositionId: saved.id,
            droneModelId: transfer.droneModelId,
            quantity: transfer.quantity,
            comment: 'Створення розрахунку розвідки',
          }).subscribe({
            next: () => {
              this.cancelEdit();
              this.load();
            },
            error: (error) => this.fail(error, error?.error?.message || 'Не вдалося передати борт зі складу в розрахунок'),
          });
          return;
        }

        this.cancelEdit();
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося зберегти повітряний розрахунок'),
    });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити повітряний розрахунок'),
    });
  }

  openDetails(item: AirAssetPosition): void {
    this.detailsItem = item;
  }

  closeDetails(): void {
    this.detailsItem = null;
  }

  openStock(item: AirAssetPosition): void {
    this.stockModalItem = item;
    this.stockForm = this.getEmptyStockForm();
    this.refreshStock(item.id);
  }

  closeStock(): void {
    this.stockModalItem = null;
    this.stockForm = this.getEmptyStockForm();
  }

  saveDroneCorrection(): void {
    if (!this.stockModalItem || !this.stockForm.droneModelId) return;
    const airAssetId = this.stockModalItem.id;
    const quantity = Number(this.stockForm.droneQuantity || 0);
    if (!Number.isInteger(quantity) || quantity < 0) {
      this.errorMessage = 'Кількість має бути цілим числом не менше 0';
      return;
    }

    this.service
      .correctDroneStock(this.stockModalItem.id, {
        droneModelId: this.stockForm.droneModelId,
        quantity,
        ...(this.stockForm.comment.trim() ? { comment: this.stockForm.comment.trim() } : {}),
      })
      .subscribe({
        next: () => {
          this.closeStock();
          this.refreshStock(airAssetId);
          this.load();
        },
        error: (error) => this.fail(error, error?.error?.message || 'Не вдалося оновити склад позиції'),
      });
  }

  saveWarheadCorrection(): void {
    if (!this.stockModalItem || !this.stockForm.warheadTypeId) return;
    const airAssetId = this.stockModalItem.id;
    const quantity = Number(this.stockForm.warheadQuantity || 0);
    if (!this.isValidWarheadQuantity(this.stockForm.warheadTypeId, quantity, true)) {
      this.errorMessage = 'Перевірте кількість БЧ';
      return;
    }

    this.service
      .correctWarheadStock(this.stockModalItem.id, {
        warheadTypeId: this.stockForm.warheadTypeId,
        quantity,
        ...(this.stockForm.comment.trim() ? { comment: this.stockForm.comment.trim() } : {}),
      })
      .subscribe({
        next: () => {
          this.closeStock();
          this.refreshStock(airAssetId);
          this.load();
        },
        error: (error) => this.fail(error, error?.error?.message || 'Не вдалося оновити склад позиції'),
      });
  }

  openReconAreas(item: AirAssetPosition): void {
    this.reconModalItem = item;
    this.reconForm = this.getEmptyReconAreaForm();
    this.refreshReconAreas(item.id);
  }

  closeReconAreas(): void {
    this.reconModalItem = null;
    this.reconForm = this.getEmptyReconAreaForm();
  }

  editReconArea(area: AirReconArea): void {
    this.reconForm = {
      id: area.id || null,
      name: area.name || '',
      activeDate: area.activeDate ? area.activeDate.slice(0, 10) : this.today(),
      plannedStartAt: this.toDatetimeLocal(area.plannedStartAt),
      plannedEndAt: this.toDatetimeLocal(area.plannedEndAt),
      status: area.status || 'planned',
      note: area.note || '',
      points: (area.points || [])
        .slice()
        .sort((a, b) => (a.pointOrder ?? 0) - (b.pointOrder ?? 0))
        .map((point) => ({ lat: String(point.lat), lng: String(point.lng) })),
    };
    while (this.reconForm.points.length < 3) this.reconForm.points.push({ lat: '', lng: '' });
  }

  saveReconArea(): void {
    if (!this.reconModalItem) return;
    const airAssetId = this.reconModalItem.id;
    const body = this.buildReconAreaBody();
    if (!body) return;

    const request = this.reconForm.id
      ? this.service.updateReconArea(this.reconForm.id, body)
      : this.service.createReconArea(this.reconModalItem.id, body);

    request.subscribe({
      next: () => {
        this.closeReconAreas();
        this.refreshReconAreas(airAssetId);
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося зберегти район розвідки'),
    });
  }

  removeReconArea(area: AirReconArea): void {
    if (!area.id || !this.reconModalItem) return;
    const airAssetId = this.reconModalItem.id;
    this.service.deleteReconArea(area.id).subscribe({
      next: () => {
        this.closeReconAreas();
        this.refreshReconAreas(airAssetId);
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити район розвідки'),
    });
  }

  openTask(item?: AirAssetPosition): void {
    this.taskForm = this.getEmptyTaskForm(item?.assetGroup || 'recon', item?.id || '');
    this.taskModalOpen = true;
    this.onTaskAssetChange();
  }

  closeTask(): void {
    this.taskModalOpen = false;
    this.taskForm = this.getEmptyTaskForm();
  }

  onTaskAssetChange(): void {
    const asset = this.taskAsset;
    if (!asset) return;
    this.taskForm.taskType = asset.assetGroup;
    this.taskForm.droneModelId = this.taskAvailableDrones.length === 1 ? this.taskAvailableDrones[0].droneModelId : '';
    this.taskForm.warheadTypeId =
      asset.assetGroup === 'combat' && this.taskAvailableWarheads.length === 1 ? this.taskAvailableWarheads[0].warheadTypeId : '';
  }

  saveTask(): void {
    const body = this.buildTaskBody();
    if (!body) return;

    const request = this.taskForm.id ? this.service.updateTask(this.taskForm.id, body) : this.service.createTask(body);
    request.subscribe({
      next: () => {
        this.closeTask();
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося зберегти задачу'),
    });
  }

  removeTask(task: AirAssetTask): void {
    this.service.deleteTask(task.id).subscribe({
      next: () => {
        if (this.taskForm.id === task.id) this.closeTask();
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити задачу'),
    });
  }

  addTaskPoint(): void {
    this.taskForm.points.push({ lat: '', lng: '' });
  }

  removeTaskPoint(index: number): void {
    this.taskForm.points.splice(index, 1);
    while (this.taskForm.points.length < 3) this.addTaskPoint();
  }

  startTaskMapDrawing(): void {
    sessionStorage.setItem('euclida_air_task_draft', JSON.stringify({ form: this.taskForm }));
    void this.router.navigate(['/map'], { queryParams: { mode: 'air-task', returnTo: 'air-assets' } });
  }

  addReconPoint(): void {
    this.form.reconAreaPoints.push({ lat: '', lng: '' });
  }

  removeReconPoint(index: number): void {
    this.form.reconAreaPoints.splice(index, 1);
    while (this.form.reconAreaPoints.length < 3) this.addReconPoint();
  }

  addReconModalPoint(): void {
    this.reconForm.points.push({ lat: '', lng: '' });
  }

  removeReconModalPoint(index: number): void {
    this.reconForm.points.splice(index, 1);
    while (this.reconForm.points.length < 3) this.addReconModalPoint();
  }

  startReconAreaMapDrawing(): void {
    if (!this.reconModalItem) return;

    sessionStorage.setItem(
      'euclida_recon_area_draft',
      JSON.stringify({
        airAssetId: this.reconModalItem.id,
        form: this.reconForm,
      }),
    );

    void this.router.navigate(['/map'], {
      queryParams: {
        mode: 'recon-area',
        returnTo: 'air-assets',
        airAssetId: this.reconModalItem.id,
      },
    });
  }

  getStock(item: AirAssetPosition): PositionStock {
    return this.stockByAsset[item.id] || { drones: [], warheads: [] };
  }

  getStockSummary(item: AirAssetPosition): string {
    const stock = this.getStock(item);
    const parts = [
      ...stock.drones.filter((row) => row.quantity > 0).map((row) => `${row.droneModel?.name || 'Борт'}: ${row.quantity}`),
      ...stock.warheads.filter((row) => row.quantity > 0).map((row) => `${row.warheadType?.name || 'БЧ'}: ${this.getWarheadQuantityLabel(row.quantity, row.warheadType)}`),
    ];

    return parts.length ? parts.join(', ') : '—';
  }

  onReconStockChange(): void {
    const stock = this.selectedReconDepotStock;
    if (!stock) {
      this.form.assetName = '';
      this.form.sourceDroneQuantity = '1';
      return;
    }

    this.form.assetName = stock.droneModel?.name || '';
    const quantity = Number(this.form.sourceDroneQuantity || 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > stock.quantity) {
      this.form.sourceDroneQuantity = '1';
    }
  }

  getDepotDroneKey(row: DroneDepotStock): string {
    return `${row.depotId}:${row.droneModelId}`;
  }

  getDepotDroneLabel(row: DroneDepotStock): string {
    const model = row.droneModel?.name || row.droneModelId;
    const depot = row.depot?.name || 'Склад';
    return `${model} · ${depot} · ${row.quantity} шт`;
  }

  getWarheadUnitLabel(type?: DroneWarheadType | null): string {
    return type?.measureUnit === 'kg' ? 'кг' : 'шт';
  }

  getWarheadQuantityLabel(quantity: number | string, type?: DroneWarheadType | null): string {
    const value = Number(quantity || 0);
    const formatted = type?.measureUnit === 'kg' ? value.toFixed(3).replace(/\.?0+$/, '') : String(Math.trunc(value));
    return `${formatted} ${this.getWarheadUnitLabel(type)}`;
  }

  get selectedStockWarheadType(): DroneWarheadType | null {
    return this.warheadTypes.find((type) => type.id === this.stockForm.warheadTypeId) || null;
  }

  get stockWarheadQuantityStep(): string {
    return this.selectedStockWarheadType?.measureUnit === 'kg' ? '0.001' : '1';
  }

  isValidWarheadQuantity(warheadTypeId: string, quantity: number, allowZero: boolean): boolean {
    const type = this.warheadTypes.find((item) => item.id === warheadTypeId);
    if (!Number.isFinite(quantity) || quantity < (allowZero ? 0 : 1)) return false;
    return type?.measureUnit === 'kg' || Number.isInteger(quantity);
  }

  getReconStatusLabel(status?: string): string {
    if (status === 'active') return 'Активний';
    if (status === 'completed') return 'Завершений';
    if (status === 'cancelled') return 'Скасований';
    return 'План';
  }

  getGroupLabel(group: string): string {
    return group === 'combat' ? 'Бойовий' : 'Розвідка';
  }

  getReconTypeLabel(type: string | null | undefined): string {
    if (type === 'fixed_wing') return 'БпЛА крило';
    return 'Коптер';
  }

  getCombatTypeLabel(type: string | null | undefined): string {
    if (type === 'fpv_radio') return 'FPV радіокерування';
    if (type === 'fpv_fiber') return 'FPV оптоволокно';
    if (type === 'kamikaze') return 'Камікадзе';
    if (type === 'heavy_bomber') return 'Важкий бомбер';
    return '—';
  }

  getReadinessLabel(status: string): string {
    return status === 'ready' ? 'БГ' : 'НЕ БГ';
  }

  private getReconStockTransfer(): { depotId: string; droneModelId: string; quantity: number } | null {
    if (this.form.assetGroup !== 'recon' || this.editingId) return null;

    const stock = this.selectedReconDepotStock;
    if (!stock) {
      this.errorMessage = 'Оберіть готовий борт зі складу БпЛА';
      return null;
    }

    const quantity = Number(this.form.sourceDroneQuantity || 0);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > stock.quantity) {
      this.errorMessage = `Кількість має бути цілим числом від 1 до ${stock.quantity}`;
      return null;
    }

    return { depotId: stock.depotId, droneModelId: stock.droneModelId, quantity };
  }

  private buildRequestBody(): CreateAirAssetPositionRequest | null {
    if (!this.form.name.trim()) {
      this.errorMessage = 'Вкажіть позицію';
      return null;
    }

    if (!this.form.unitId) {
      this.errorMessage = 'Вкажіть підрозділ';
      return null;
    }

    if (!this.form.callsign.trim()) {
      this.errorMessage = 'Вкажіть позивний';
      return null;
    }

    if (this.form.coordinateMode === 'decimal' && (!this.form.lat || !this.form.lng)) {
      this.errorMessage = 'Вкажіть Lat/Lng позиції';
      return null;
    }

    if (this.form.coordinateMode === 'mgrs' && !this.form.mgrs.trim()) {
      this.errorMessage = 'Вкажіть MGRS';
      return null;
    }

    const base: CreateAirAssetPositionRequest = {
      name: this.form.name.trim(),
      unitId: this.form.unitId,
      callsign: this.form.callsign.trim(),
      assetGroup: this.form.assetGroup,
      ...(this.form.coordinateMode === 'decimal'
        ? { lat: Number(this.form.lat), lng: Number(this.form.lng), ...(this.form.mgrs.trim() ? { mgrs: this.form.mgrs.trim() } : {}) }
        : { mgrs: this.form.mgrs.trim() }),
      readinessStatus: this.form.readinessStatus,
      ...(this.form.readinessStatus === 'not_ready' && this.form.notReadyReason.trim() ? { notReadyReason: this.form.notReadyReason.trim() } : {}),
      ...(this.form.personnelRotationDate ? { personnelRotationDate: this.form.personnelRotationDate } : {}),
      assetQuantity: 0,
      ...(this.form.note.trim() ? { note: this.form.note.trim() } : {}),
    };

    if (this.form.assetGroup === 'recon') {
      const stock = this.selectedReconDepotStock;
      const assetName = this.editingId ? this.form.assetName.trim() : stock?.droneModel?.name || this.form.assetName.trim();
      if (!assetName) {
        this.errorMessage = this.editingId ? 'Вкажіть найменування засобу розвідки' : 'Оберіть готовий борт зі складу БпЛА';
        return null;
      }

      return {
        ...base,
        reconType: this.form.reconType,
        assetName,
        ...(!this.editingId && stock ? { assetQuantity: Number(this.form.sourceDroneQuantity || 1) } : {}),
      };
    }

    if (!this.form.droneModel.trim()) {
      this.errorMessage = 'Вкажіть модель дрона';
      return null;
    }

    if (!this.form.mainDirectionUnits || !this.form.traverseLeftUnits || !this.form.traverseRightUnits) {
      this.errorMessage = 'Для бойового розрахунку вкажіть сектор роботи';
      return null;
    }

    return {
      ...base,
      combatType: this.form.combatType,
      droneModel: this.form.droneModel.trim(),
      mainDirectionUnits: Number(this.form.mainDirectionUnits),
      traverseLeftUnits: Number(this.form.traverseLeftUnits),
      traverseRightUnits: Number(this.form.traverseRightUnits),
      ...(this.form.maxSectorDistanceM ? { maxSectorDistanceM: Number(this.form.maxSectorDistanceM) } : {}),
    };
  }
  private getEmptyForm(group: AirAssetGroup = 'recon'): AirAssetForm {
    return {
      name: '',
      unitId: '',
      callsign: '',
      assetGroup: group,
      reconType: 'copter',
      combatType: 'fpv_radio',
      coordinateMode: 'decimal',
      lat: '',
      lng: '',
      mgrs: '',
      readinessStatus: 'ready',
      notReadyReason: '',
      personnelRotationDate: '',
      assetName: '',
      droneModel: '',
      sourceDroneStockKey: '',
      sourceDroneQuantity: '1',
      mainDirectionUnits: '',
      traverseLeftUnits: '',
      traverseRightUnits: '',
      maxSectorDistanceM: '',
      reconAreaName: '',
      reconAreaActiveDate: this.today(),
      reconAreaNote: '',
      reconAreaPoints: this.getDefaultReconPoints(),
      note: '',
    };
  }

  private getDefaultReconPoints(): ReconPointForm[] {
    return [
      { lat: '', lng: '' },
      { lat: '', lng: '' },
      { lat: '', lng: '' },
    ];
  }

  private loadStocks(items: AirAssetPosition[]): void {
    if (items.length === 0) {
      this.stockByAsset = {};
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    const requests: Record<string, Observable<PositionStock>> = {};
    items.forEach((item) => {
      requests[item.id] = forkJoin({
        drones: this.service.getDroneStock(item.id).pipe(catchError(() => of([]))),
        warheads: this.service.getWarheadStock(item.id).pipe(catchError(() => of([]))),
      }).pipe(catchError(() => of({ drones: [], warheads: [] })));
    });

    forkJoin(requests).subscribe({
      next: (stockByAsset) => {
        this.stockByAsset = stockByAsset;
        this.loading = false;
        this.restoreReconAreaDraft();
        this.restoreTaskDraft();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.stockByAsset = {};
        this.loading = false;

        if (!this.isUnauthorized(error)) {
          this.errorMessage = 'Не вдалося завантажити склад позицій';
        }

        this.cdr.markForCheck();
      },
    });
  }

  private syncOpenAssetReferences(items: AirAssetPosition[]): void {
    const findFreshAsset = (id: string): AirAssetPosition | null =>
      items.find((item) => item.id === id) || null;

    if (this.detailsItem) {
      this.detailsItem = findFreshAsset(this.detailsItem.id);
    }

    if (this.stockModalItem) {
      const freshStockItem = findFreshAsset(this.stockModalItem.id);
      if (freshStockItem) {
        this.stockModalItem = freshStockItem;
      } else {
        this.closeStock();
      }
    }

    if (this.reconModalItem) {
      const freshReconItem = findFreshAsset(this.reconModalItem.id);
      if (freshReconItem) {
        this.reconModalItem = freshReconItem;
      } else {
        this.closeReconAreas();
      }
    }

    if (this.taskModalOpen && this.taskForm.id) {
      const freshTask = this.tasks.find((task) => task.id === this.taskForm.id);
      if (!freshTask) {
        this.closeTask();
      }
    }
  }

  private refreshStock(airAssetId: string): void {
    forkJoin({
      drones: this.service.getDroneStock(airAssetId),
      warheads: this.service.getWarheadStock(airAssetId),
    }).subscribe({
      next: (stock) => {
        this.stockByAsset = { ...this.stockByAsset, [airAssetId]: stock };
        this.cdr.markForCheck();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити склад позиції'),
    });
  }

  private refreshReconAreas(airAssetId: string): void {
    this.service.getReconAreas(airAssetId).subscribe({
      next: (areas) => {
        this.items = this.items.map((item) => (item.id === airAssetId ? { ...item, reconAreas: areas } : item));
        if (this.reconModalItem?.id === airAssetId) {
          this.reconModalItem = { ...this.reconModalItem, reconAreas: areas };
        }
        this.cdr.markForCheck();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити райони розвідки'),
    });
  }

  private buildReconAreaBody(): AirReconArea | null {
    const points = this.reconForm.points
      .filter((point) => point.lat.trim() || point.lng.trim())
      .map((point, index) => ({
        pointOrder: index + 1,
        lat: Number(point.lat),
        lng: Number(point.lng),
      }));

    if (points.length < 3) {
      this.errorMessage = 'Район розвідки має містити мінімум 3 точки';
      return null;
    }

    if (points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng))) {
      this.errorMessage = 'Перевірте координати району розвідки';
      return null;
    }

    return {
      name: this.reconForm.name.trim() || 'Район розвідки',
      activeDate: this.reconForm.activeDate || this.today(),
      plannedStartAt: this.reconForm.plannedStartAt || undefined,
      plannedEndAt: this.reconForm.plannedEndAt || undefined,
      status: this.reconForm.status,
      note: this.reconForm.note.trim() || undefined,
      points,
    };
  }

  private buildTaskBody(): UpsertAirAssetTaskRequest | null {
    const asset = this.taskAsset;
    if (!asset) {
      this.errorMessage = 'Оберіть розрахунок для задачі';
      return null;
    }

    const points = this.taskForm.points
      .filter((point) => point.lat.trim() || point.lng.trim())
      .map((point) => ({ lat: Number(point.lat), lng: Number(point.lng) }));

    if (!this.taskForm.name.trim()) {
      this.errorMessage = 'Вкажіть назву задачі';
      return null;
    }

    if (!this.taskForm.areaName.trim()) {
      this.errorMessage = 'Вкажіть назву району';
      return null;
    }

    if (points.length < 3 || points.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lng))) {
      this.errorMessage = 'Район задачі має містити мінімум 3 коректні точки';
      return null;
    }

    if (this.taskAvailableDrones.length > 1 && !this.taskForm.droneModelId) {
      this.errorMessage = 'Оберіть борт із наявних у розрахунку';
      return null;
    }

    if (asset.assetGroup === 'combat' && this.taskAvailableWarheads.length > 1 && !this.taskForm.warheadTypeId) {
      this.errorMessage = 'Оберіть БЧ із наявних у розрахунку';
      return null;
    }

    return {
      taskType: asset.assetGroup,
      name: this.taskForm.name.trim(),
      airAssetPositionId: asset.id,
      ...(this.taskForm.droneModelId ? { droneModelId: this.taskForm.droneModelId } : {}),
      ...(asset.assetGroup === 'combat' && this.taskForm.warheadTypeId ? { warheadTypeId: this.taskForm.warheadTypeId } : {}),
      areaName: this.taskForm.areaName.trim(),
      ...(this.taskForm.plannedStartAt ? { plannedStartAt: this.taskForm.plannedStartAt } : {}),
      ...(this.taskForm.plannedEndAt ? { plannedEndAt: this.taskForm.plannedEndAt } : {}),
      status: this.taskForm.status,
      ...(this.taskForm.note.trim() ? { note: this.taskForm.note.trim() } : {}),
      points,
    };
  }

  private getEmptyStockForm(): StockCorrectionForm {
    return {
      droneModelId: '',
      droneQuantity: '0',
      warheadTypeId: '',
      warheadQuantity: '0',
      comment: '',
    };
  }

  getEmptyReconAreaForm(): ReconAreaForm {
    return {
      id: null,
      name: '',
      activeDate: this.today(),
      plannedStartAt: '',
      plannedEndAt: '',
      status: 'planned',
      note: '',
      points: this.getDefaultReconPoints(),
    };
  }

  getEmptyTaskForm(taskType: AirAssetTaskType = 'recon', airAssetPositionId = ''): AirTaskForm {
    return {
      id: null,
      taskType,
      name: taskType === 'combat' ? 'Бойова задача БпЛА' : 'Задача на розвідку',
      airAssetPositionId,
      droneModelId: '',
      warheadTypeId: '',
      areaName: '',
      plannedStartAt: '',
      plannedEndAt: '',
      status: 'planned',
      note: '',
      points: this.getDefaultReconPoints(),
    };
  }

  private toDatetimeLocal(value?: string | null): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 16);
  }

  private restoreReconAreaDraft(): void {
    const raw = sessionStorage.getItem('euclida_recon_area_draft');
    if (!raw || this.items.length === 0) return;

    try {
      const draft = JSON.parse(raw) as { airAssetId?: string; form?: ReconAreaForm; points?: ReconPointForm[] };
      const item = this.items.find((candidate) => candidate.id === draft.airAssetId);
      if (!item || !draft.form) return;

      this.reconModalItem = item;
      this.reconForm = {
        ...draft.form,
        points: draft.points?.length ? draft.points : draft.form.points,
      };
      while (this.reconForm.points.length < 3) this.reconForm.points.push({ lat: '', lng: '' });
      sessionStorage.removeItem('euclida_recon_area_draft');
      this.refreshReconAreas(item.id);
    } catch {
      sessionStorage.removeItem('euclida_recon_area_draft');
    }
  }

  private restoreTaskDraft(): void {
    const raw = sessionStorage.getItem('euclida_air_task_draft');
    if (!raw || this.items.length === 0) return;

    try {
      const draft = JSON.parse(raw) as { form?: AirTaskForm; points?: ReconPointForm[] };
      if (!draft.form) return;

      this.taskForm = {
        ...draft.form,
        points: draft.points?.length ? draft.points : draft.form.points,
      };
      while (this.taskForm.points.length < 3) this.taskForm.points.push({ lat: '', lng: '' });
      this.taskModalOpen = true;
      this.onTaskAssetChange();
      sessionStorage.removeItem('euclida_air_task_draft');
    } catch {
      sessionStorage.removeItem('euclida_air_task_draft');
    }
  }

  private normalizeCombatType(value: string | null | undefined): AirCombatType {
    if (value === 'fpv_fiber' || value === 'kamikaze' || value === 'heavy_bomber') return value;
    return 'fpv_radio';
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private fail(error: unknown, message: string): void {
    if (this.isUnauthorized(error)) {
      this.errorMessage = '';
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.errorMessage = message;
    this.loading = false;
    this.cdr.markForCheck();
  }

  private isUnauthorized(error: unknown): boolean {
    return (error as { status?: number })?.status === 401;
  }
}

