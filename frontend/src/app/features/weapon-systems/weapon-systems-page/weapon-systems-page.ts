import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Unit } from '../../units/unit.model';
import { UnitsService } from '../../units/units.service';
import { WeaponModel } from '../../weapon-models/weapon-model.model';
import { WeaponModelsService } from '../../weapon-models/weapon-models.service';
import { WeaponSystem } from '../weapon-system.model';
import { WeaponSystemsService } from '../weapon-systems.service';
import { FirePosition } from '../../fire-positions/fire-position.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import { AuthService } from '../../auth/auth.service';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-weapon-systems-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './weapon-systems-page.html',
  styleUrl: './weapon-systems-page.css',
})
export class WeaponSystemsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  saving = false;
  deletingId = '';
  syncing = false;
  movingId = '';
  items: WeaponSystem[] = [];
  weaponModels: WeaponModel[] = [];
  units: Unit[] = [];
  firePositions: FirePosition[] = [];
  loading = true;
  errorMessage = '';
  editingId: string | null = null;

  form = {
    weaponModelId: '',
    serialNumber: '',
    callsign: '',
    unitId: '',
    readinessStatus: 'unknown',
    notReadyReason: '',
    locationType: 'reserve',
firePositionId: '',
  };

  constructor(
    private readonly service: WeaponSystemsService,
    private readonly weaponModelsService: WeaponModelsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly firePositionsService: FirePositionsService,
    private readonly auth: AuthService,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['weapons', 'map', 'analytics'], () => this.load()));
  }

  get totalCount(): number {
    return this.items.length;
  }

  get readyCount(): number {
    return this.items.filter((x) => x.readinessStatus === 'ready').length;
  }

  get notReadyCount(): number {
    return this.items.filter((x) => x.readinessStatus === 'not_ready').length;
  }

  get repairCount(): number {
    return this.items.filter((x) => x.readinessStatus === 'repair').length;
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.loadSubscription?.unsubscribe();

    this.loadSubscription = forkJoin({
      items: this.service.getAll(),
      models: this.weaponModelsService.getAll(),
      units: this.unitsService.getAll(),
      positions: this.firePositionsService.getAll(),
    }).subscribe({
      next: ({ items, models, units, positions }) => {
        this.items = items;
        this.weaponModels = models;
        this.units = units;
        this.firePositions = positions;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити СГ'),
    });
  }

  save(): void {
    if (this.saving) {
      return;
    }

    this.errorMessage = '';

    if (!this.form.weaponModelId) {
      this.errorMessage = 'Оберіть зразок Озброєння';
      return;
    }

    if (this.form.locationType === 'fire_position' && !this.form.firePositionId) {
      this.errorMessage = 'Оберіть нову ВП';
      return;
    }

    const body = {
  weaponModelId: this.form.weaponModelId,
  serialNumber: this.form.serialNumber.trim() || undefined,
  callsign: this.form.callsign.trim() || undefined,

  locationType: this.form.locationType,

  unitId:
    this.form.locationType === 'reserve'
      ? this.form.unitId || undefined
      : this.form.unitId || undefined,

  firePositionId:
    this.form.locationType === 'fire_position'
      ? this.form.firePositionId || undefined
      : null,

  readinessStatus: this.form.readinessStatus,
  notReadyReason:
    this.form.readinessStatus === 'ready'
      ? undefined
      : this.form.notReadyReason.trim() || undefined,
};

    const currentItem = this.editingId
      ? this.items.find((item) => item.id === this.editingId)
      : null;

    const isFirePositionReassign =
      !!this.editingId &&
      this.form.locationType === 'fire_position' &&
      !!this.form.firePositionId &&
      currentItem?.firePositionId !== this.form.firePositionId;

    const request = isFirePositionReassign
      ? this.service.assignToFirePosition(
          this.editingId!,
          this.form.firePositionId,
          this.form.unitId || undefined,
        )
      : this.editingId
        ? this.service.update(this.editingId, body)
        : this.service.create(body);

    this.saving = true;

    request.subscribe({
      next: () => {
        this.saving = false;
        this.cancelEdit();
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.fail(error, error?.error?.message || 'Не вдалося зберегти СГ');
      },
    });
  }

  startEdit(item: WeaponSystem): void {
    this.editingId = item.id;

    this.form = {
  weaponModelId: item.weaponModelId || '',
  serialNumber: item.serialNumber || '',
  callsign: item.callsign || '',
  unitId: item.unitId || '',
  locationType: item.locationType || 'reserve',
  firePositionId: item.firePositionId || '',
  readinessStatus: item.readinessStatus || 'unknown',
  notReadyReason: item.notReadyReason || '',
};

    this.cdr.detectChanges();
  }

  cancelEdit(): void {
    this.editingId = null;

   this.form = {
  weaponModelId: '',
  serialNumber: '',
  callsign: '',
  unitId: '',
  locationType: 'reserve',
  firePositionId: '',
  readinessStatus: 'unknown',
  notReadyReason: '',
};

    this.cdr.detectChanges();
  }

  remove(id: string): void {
    if (this.deletingId) {
      return;
    }

    this.deletingId = id;

    this.service.delete(id).subscribe({
      next: () => {
        this.deletingId = '';
        this.load();
      },
      error: (error) => {
        this.deletingId = '';
        this.fail(error, error?.error?.message || 'Не вдалося видалити СГ');
      },
    });
  }

  getReadinessLabel(status: string): string {
    if (status === 'ready') return 'БГ';
    if (status === 'not_ready') return 'НЕ БГ';
    if (status === 'repair') return 'Ремонт';
    return 'Невідомо';
  }

  getReadinessClass(status: string): string {
    if (status === 'ready') return 'ready';
    if (status === 'not_ready') return 'danger';
    if (status === 'repair') return 'repair';
    return 'unknown';
  }

  private fail(error: unknown, message: string): void {
        this.errorMessage = message;
    this.loading = false;
    this.cdr.detectChanges();
  }
  getAvailableFirePositions(): FirePosition[] {
  const occupiedIds = this.items
    .filter((item) => item.locationType === 'fire_position' && item.firePositionId)
    .map((item) => item.firePositionId);

  return this.firePositions.filter((position) => {
    if (this.editingId && this.form.firePositionId === position.id) {
      return true;
    }

    return !occupiedIds.includes(position.id);
  });
}
onLocationTypeChange(nextLocationType?: string): void {
  this.form.locationType = nextLocationType || this.form.locationType;
  this.form.unitId = '';
  this.form.firePositionId = '';

  if (this.form.locationType === 'fire_position') {
    this.form.readinessStatus = 'ready';
    this.form.notReadyReason = '';
  }
}

get visibleItems() {
  const user = this.auth.getUser();

  if (!user) {
    return [];
  }

  if (user.role === 'admin' || user.scope === 'main') {
    return this.items;
  }

  if (!user.unitId) {
    return [];
  }

  if (user.scope === 'battery') {
    return this.items.filter((item) => item.unitId === user.unitId);
  }

  if (user.scope === 'division') {
    return this.items.filter((item) =>
      this.units.some(
        (unit) =>
          unit.id === item.unitId &&
          (unit.id === user.unitId || unit.parentId === user.unitId),
      ),
    );
  }

  return [];
}

get availableUnits() {
  const user = this.auth.getUser();

  if (!user) {
    return [];
  }

  if (user.role === 'admin' || user.scope === 'main') {
    return this.units;
  }

  if (!user.unitId) {
    return [];
  }

  if (user.scope === 'battery') {
    return this.units.filter((unit) => unit.id === user.unitId);
  }

  if (user.scope === 'division') {
    return this.units.filter(
      (unit) => unit.id === user.unitId || unit.parentId === user.unitId,
    );
  }

  return [];
}

canEditWeapon(item: { unitId: string | null }): boolean {
  const user = this.auth.getUser();

  if (!user) {
    return false;
  }

  if (user.role === 'admin' || user.scope === 'main') {
    return true;
  }

  if (!user.unitId || !item.unitId) {
    return false;
  }

  if (user.scope === 'battery') {
    return item.unitId === user.unitId;
  }

  if (user.scope === 'division') {
    return this.units.some(
      (unit) =>
        unit.id === item.unitId &&
        (unit.id === user.unitId || unit.parentId === user.unitId),
    );
  }

  return false;
}

canCreateWeapon(): boolean {
  const user = this.auth.getUser();

  return !!user && (user.role === 'admin' || user.role === 'operator');
}

syncFirePositionStates(): void {
  if (this.syncing) {
    return;
  }

  this.syncing = true;

  this.service.syncFirePositionStates().subscribe({
    next: () => {
      this.syncing = false;
      this.errorMessage = '';
      this.load();
    },
    error: (error) => {
      this.syncing = false;
      this.fail(error, 'Не вдалося синхронізувати стан ВП');
    },
  });
}

moveToReserve(item: WeaponSystem): void {
  if (this.movingId || !confirm(`Зняти ${item.callsign || item.serialNumber || 'СГ'} з ВП?`)) {
    return;
  }

  this.movingId = item.id;

  this.service.moveToReserve(item.id).subscribe({
    next: () => {
      this.movingId = '';

      if (this.editingId === item.id) {
        this.cancelEdit();
      }

      this.load();
    },
    error: (error) => {
      this.movingId = '';
      this.fail(error, 'Не вдалося зняти СГ з ВП');
    },
  });
}

}