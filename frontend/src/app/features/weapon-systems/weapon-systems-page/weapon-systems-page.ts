import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { AuthService } from '../../auth/auth.service';
import { FirePosition } from '../../fire-positions/fire-position.model';
import { FirePositionsService } from '../../fire-positions/fire-positions.service';
import { Unit } from '../../units/unit.model';
import { UnitsService } from '../../units/units.service';
import { WeaponModel } from '../../weapon-models/weapon-model.model';
import { WeaponModelsService } from '../../weapon-models/weapon-models.service';
import { WeaponSystem } from '../weapon-system.model';
import { WeaponSystemsService } from '../weapon-systems.service';

type WeaponStatusFilter = 'all' | 'combat_ready' | 'not_combat_ready' | 'moving';
type NotReadyReason = 'breakdown' | 'threat' | 'crew' | 'maintenance' | 'other';

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
  maintenanceId = '';
  readinessId = '';
  items: WeaponSystem[] = [];
  weaponModels: WeaponModel[] = [];
  units: Unit[] = [];
  firePositions: FirePosition[] = [];
  deploymentTargets: Record<string, string> = {};
  loading = true;
  errorMessage = '';
  editingId: string | null = null;
  formModalOpen = false;
  activeFilter: WeaponStatusFilter = 'all';

  form = {
    weaponModelId: '',
    serialNumber: '',
    callsign: '',
    unitId: '',
    readinessStatus: 'not_combat_ready',
    notReadyReason: 'other' as NotReadyReason,
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
    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['weapons', 'map', 'analytics'], () => this.load()),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  get visibleItems(): WeaponSystem[] {
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
            unit.id === item.unitId && (unit.id === user.unitId || unit.parentId === user.unitId),
        ),
      );
    }

    return [];
  }

  get filteredItems(): WeaponSystem[] {
    if (this.activeFilter === 'all') {
      return this.visibleItems;
    }

    if (this.activeFilter === 'moving') {
      return this.visibleItems.filter((item) => this.isMoving(item));
    }

    return this.visibleItems.filter(
      (item) => this.normalizeReadiness(item.readinessStatus) === this.activeFilter,
    );
  }

  get totalCount(): number {
    return this.visibleItems.length;
  }

  get readyCount(): number {
    return this.visibleItems.filter(
      (item) => this.normalizeReadiness(item.readinessStatus) === 'combat_ready',
    ).length;
  }

  get notReadyCount(): number {
    return this.visibleItems.filter(
      (item) => this.normalizeReadiness(item.readinessStatus) === 'not_combat_ready',
    ).length;
  }

  get movingCount(): number {
    return this.visibleItems.filter((item) => this.isMoving(item)).length;
  }

  get activeFilterLabel(): string {
    const labels: Record<WeaponStatusFilter, string> = {
      all: 'Усі',
      combat_ready: 'БГ',
      not_combat_ready: 'НЕ БГ',
      moving: 'У русі',
    };

    return labels[this.activeFilter];
  }

  get availableUnits(): Unit[] {
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
      return this.units.filter((unit) => unit.id === user.unitId || unit.parentId === user.unitId);
    }

    return [];
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

  setFilter(filter: WeaponStatusFilter): void {
    this.activeFilter = filter;
  }

  clearFilter(): void {
    this.activeFilter = 'all';
  }

  save(): void {
    if (this.saving) {
      return;
    }

    this.errorMessage = '';

    if (!this.form.weaponModelId) {
      this.errorMessage = 'Оберіть зразок озброєння';
      return;
    }

    if (!this.form.unitId) {
      this.errorMessage = 'Оберіть підрозділ';
      return;
    }

    const readinessStatus = this.normalizeReadiness(this.form.readinessStatus);
    const body = {
      weaponModelId: this.form.weaponModelId,
      serialNumber: this.form.serialNumber.trim() || undefined,
      callsign: this.form.callsign.trim() || undefined,
      unitId: this.form.unitId,
      readinessStatus,
      notReadyReason:
        readinessStatus === 'combat_ready' ? undefined : this.form.notReadyReason || 'other',
    };

    const request = this.editingId
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
    this.formModalOpen = true;
    this.form = {
      weaponModelId: item.weaponModelId || '',
      serialNumber: item.serialNumber || '',
      callsign: item.callsign || '',
      unitId: item.unitId || '',
      readinessStatus: this.normalizeReadiness(item.readinessStatus),
      notReadyReason: (this.normalizeReason(item.notReadyReason) || 'other') as NotReadyReason,
    };
    this.cdr.detectChanges();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.formModalOpen = false;
    this.form = {
      weaponModelId: '',
      serialNumber: '',
      callsign: '',
      unitId: '',
      readinessStatus: 'not_combat_ready',
      notReadyReason: 'other',
    };
    this.cdr.detectChanges();
  }

  openCreate(): void {
    this.cancelEdit();
    this.formModalOpen = true;
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

  planMoveToFirePosition(item: WeaponSystem): void {
    const targetFirePositionId = this.deploymentTargets[item.id];
    if (this.movingId || !targetFirePositionId) {
      return;
    }

    const force = this.normalizeReadiness(item.readinessStatus) !== 'combat_ready';
    if (force && !confirm('СГ не БГ. Призначити на ВП з підтвердженням?')) {
      return;
    }

    this.movingId = item.id;
    this.service.planMoveToFirePosition(item.id, { targetFirePositionId, force }).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося призначити СГ на ВП'),
    });
  }

  moveToReserve(item: WeaponSystem): void {
    if (this.movingId || !confirm(`Зняти ${item.callsign || item.serialNumber || 'СГ'} з ВП?`)) {
      return;
    }

    this.movingId = item.id;
    this.service.planMoveToReserve(item.id).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося зняти СГ з ВП'),
    });
  }

  startMove(item: WeaponSystem): void {
    if (this.movingId) {
      return;
    }

    this.movingId = item.id;
    const deployment = this.getActiveDeployment(item);
    const request =
      deployment?.status === 'planned'
        ? deployment.toLocationType === 'reserve_area'
          ? this.service.startMoveToReserve(item.id)
          : this.service.startMoveToFirePosition(item.id)
        : item.deploymentStatus === 'moving_to_reserve_area'
          ? this.service.confirmReserveArrival(item.id)
          : this.service.confirmFirePositionArrival(item.id);

    request.subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося підтвердити прибуття СГ'),
    });
  }

  setCombatReady(item: WeaponSystem): void {
    if (this.readinessId) {
      return;
    }

    this.readinessId = item.id;
    this.service.confirmReadiness(item.id, { readinessStatus: 'combat_ready' }).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося підтвердити готовність'),
    });
  }

  setNotCombatReady(item: WeaponSystem): void {
    if (this.readinessId) {
      return;
    }

    this.readinessId = item.id;
    this.service
      .confirmReadiness(item.id, { readinessStatus: 'not_combat_ready', notReadyReason: 'other' })
      .subscribe({
        next: () => this.afterAction(),
        error: (error) => this.failAction(error, 'Не вдалося змінити готовність'),
      });
  }

  openRepair(item: WeaponSystem): void {
    if (this.maintenanceId) {
      return;
    }

    this.maintenanceId = item.id;
    this.service.openMaintenance(item.id, { reason: 'breakdown', description: 'Ремонт відкрито оператором' }).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося відкрити ремонт'),
    });
  }

  startMaintenance(item: WeaponSystem): void {
    if (this.maintenanceId) {
      return;
    }

    this.maintenanceId = item.id;
    this.service.startMaintenance(item.id).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося розпочати ТО'),
    });
  }

  completeMaintenance(item: WeaponSystem): void {
    if (this.maintenanceId) {
      return;
    }

    this.maintenanceId = item.id;
    this.service.completeMaintenance(item.id, { result: 'Завершено оператором' }).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося завершити ТО'),
    });
  }

  cancelMaintenance(item: WeaponSystem): void {
    if (this.maintenanceId) {
      return;
    }

    this.maintenanceId = item.id;
    this.service.cancelMaintenance(item.id).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося скасувати ТО'),
    });
  }

  cancelDeployment(item: WeaponSystem): void {
    if (this.movingId) {
      return;
    }

    this.movingId = item.id;
    this.service.cancelDeployment(item.id).subscribe({
      next: () => this.afterAction(),
      error: (error) => this.failAction(error, 'Не вдалося скасувати переміщення'),
    });
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
        this.fail(error, 'Не вдалося синхронізувати ВП');
      },
    });
  }

  getAvailableFirePositions(item?: WeaponSystem): FirePosition[] {
    const occupiedIds = this.items
      .filter((weapon) => weapon.id !== item?.id)
      .map((weapon) => {
        if (this.isAtFirePosition(weapon)) {
          return weapon.currentFirePositionId ?? weapon.firePositionId;
        }

        const deployment = this.getActiveDeployment(weapon);
        return deployment?.toLocationType === 'fire_position' ? deployment.toLocationId : null;
      })
      .filter((id): id is string => !!id);

    return this.firePositions.filter((position) => !occupiedIds.includes(position.id));
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
          unit.id === item.unitId && (unit.id === user.unitId || unit.parentId === user.unitId),
      );
    }

    return false;
  }

  canCreateWeapon(): boolean {
    const user = this.auth.getUser();
    return !!user && (user.role === 'admin' || user.role === 'operator');
  }

  canAssign(item: WeaponSystem): boolean {
    return (
      this.canEditWeapon(item) &&
      this.getDeploymentStatus(item) === 'reserve_area' &&
      !this.getActiveDeployment(item) &&
      !this.hasOpenMaintenance(item)
    );
  }

  canWithdraw(item: WeaponSystem): boolean {
    return (
      this.canEditWeapon(item) &&
      this.isAtFirePosition(item) &&
      !this.getActiveDeployment(item) &&
      !this.hasOpenMaintenance(item)
    );
  }

  canConfirmArrival(item: WeaponSystem): boolean {
    return this.canEditWeapon(item) && (!!this.getActiveDeployment(item) || this.isMoving(item));
  }

  canStartMoveToFirePosition(item: WeaponSystem): boolean {
    const deployment = this.getActiveDeployment(item);
    return (
      this.canEditWeapon(item) &&
      deployment?.status === 'planned' &&
      deployment.toLocationType === 'fire_position'
    );
  }

  canConfirmFirePositionArrival(item: WeaponSystem): boolean {
    const deployment = this.getActiveDeployment(item);
    return (
      this.canEditWeapon(item) &&
      ((deployment?.status === 'moving' && deployment.toLocationType === 'fire_position') ||
        this.getDeploymentStatus(item) === 'moving_to_fire_position')
    );
  }

  canStartMoveToReserve(item: WeaponSystem): boolean {
    const deployment = this.getActiveDeployment(item);
    return (
      this.canEditWeapon(item) &&
      deployment?.status === 'planned' &&
      deployment.toLocationType === 'reserve_area'
    );
  }

  canConfirmReserveArrival(item: WeaponSystem): boolean {
    const deployment = this.getActiveDeployment(item);
    return (
      this.canEditWeapon(item) &&
      ((deployment?.status === 'moving' && deployment.toLocationType === 'reserve_area') ||
        this.getDeploymentStatus(item) === 'moving_to_reserve_area')
    );
  }

  canCancelDeployment(item: WeaponSystem): boolean {
    return this.canEditWeapon(item) && !!this.getActiveDeployment(item);
  }

  isAtFirePosition(item: WeaponSystem): boolean {
    return this.getDeploymentStatus(item) === 'at_fire_position';
  }

  isMoving(item: WeaponSystem): boolean {
    return ['moving_to_fire_position', 'moving_to_reserve_area'].includes(
      this.getDeploymentStatus(item),
    );
  }

  hasOpenMaintenance(item: WeaponSystem): boolean {
    return item.maintenances?.some((maintenance) =>
      ['opened', 'in_progress'].includes(maintenance.status),
    ) || ['opened', 'in_progress', 'pending', 'approved'].includes(item.maintenanceStatus || '');
  }

  canStartMaintenance(item: WeaponSystem): boolean {
    return this.getMaintenanceStatus(item) === 'opened' || item.maintenanceStatus === 'pending';
  }

  canCompleteMaintenance(item: WeaponSystem): boolean {
    return this.getMaintenanceStatus(item) === 'in_progress' || item.maintenanceStatus === 'approved';
  }

  canCancelMaintenance(item: WeaponSystem): boolean {
    return this.hasOpenMaintenance(item);
  }

  getReadinessLabel(status: string): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'БГ' : 'НЕ БГ';
  }

  getReadinessClass(status: string): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'ready' : 'danger';
  }

  getReasonLabel(reason: string | null): string {
    const labels: Record<NotReadyReason, string> = {
      breakdown: 'поломка',
      threat: 'загроза',
      crew: 'екіпаж',
      maintenance: 'ТО',
      other: 'інше',
    };

    const normalized = this.normalizeReason(reason);
    return normalized ? labels[normalized] : '';
  }

  getDeploymentLabel(item: WeaponSystem): string {
    const deployment = this.getActiveDeployment(item);

    if (deployment?.status === 'planned') {
      return deployment.toLocationType === 'reserve_area'
        ? 'Заплановано вихід у РЗ'
        : 'Призначено, очікує руху';
    }

    if (deployment?.status === 'moving') {
      return deployment.toLocationType === 'reserve_area' ? 'Рух до РЗ' : 'Рух до ВП';
    }

    const labels: Record<string, string> = {
      reserve_area: 'РЗ',
      moving_to_fire_position: 'рух до ВП',
      at_fire_position: 'на ВП',
      moving_to_reserve_area: 'рух до РЗ',
    };

    return labels[this.getDeploymentStatus(item)] ?? 'РЗ';
  }

  getDeploymentClass(item: WeaponSystem): string {
    const deployment = this.getActiveDeployment(item);

    if (deployment?.status === 'planned') {
      return 'planned';
    }

    if (deployment?.status === 'moving') {
      return deployment.toLocationType === 'reserve_area'
        ? 'moving-to-reserve-area'
        : 'moving-to-fire-position';
    }

    return this.getDeploymentStatus(item).replace(/_/g, '-');
  }

  getMaintenanceLabel(item: WeaponSystem): string {
    const status = this.getMaintenanceStatus(item) || 'opened';
    const labels: Record<string, string> = {
      pending: 'запит',
      approved: 'у роботі',
      completed: 'завершено',
      cancelled: 'скасовано',
      opened: 'відкрито',
      in_progress: 'у роботі',
    };

    return labels[status] ?? status;
  }

  getDeploymentActionLabel(item: WeaponSystem): string {
    const deployment = this.getActiveDeployment(item);

    if (deployment?.status === 'planned') {
      return deployment.toLocationType === 'reserve_area' ? 'Почати вихід у РЗ' : 'Почати рух до ВП';
    }

    return 'Підтвердити прибуття';
  }

  getLocationName(item: WeaponSystem): string {
    const deployment = this.getActiveDeployment(item);

    if (deployment?.toLocationType === 'fire_position' && deployment.toLocationId) {
      return this.getFirePositionName(deployment.toLocationId);
    }

    if (deployment?.toLocationType === 'reserve_area') {
      return item.unit?.name || 'Р Р—';
    }

    if (this.isAtFirePosition(item)) {
      return item.currentFirePosition?.name || item.firePosition?.name || 'ВП';
    }

    return item.unit?.name || 'РЗ';
  }

  private getFirePositionName(id: string): string {
    return this.firePositions.find((position) => position.id === id)?.name || 'ВП';
  }

  private getDeploymentStatus(item: WeaponSystem): string {
    if (item.deploymentStatus) {
      return item.deploymentStatus;
    }

    return item.locationType === 'fire_position' ? 'at_fire_position' : 'reserve_area';
  }

  private getActiveDeployment(item: WeaponSystem) {
    return item.deployments?.find((deployment) =>
      deployment.status === 'planned' || deployment.status === 'moving',
    ) ?? null;
  }

  private getMaintenanceStatus(item: WeaponSystem): string | null {
    const active = item.maintenances?.find((maintenance) =>
      maintenance.status === 'opened' || maintenance.status === 'in_progress',
    );

    return active?.status ?? item.maintenanceStatus ?? null;
  }

  private normalizeReadiness(status: string | null | undefined): 'combat_ready' | 'not_combat_ready' {
    return status === 'combat_ready' || status === 'ready' || status === 'ready_for_combat'
      ? 'combat_ready'
      : 'not_combat_ready';
  }

  private normalizeReason(reason: string | null | undefined): NotReadyReason | null {
    if (
      reason === 'breakdown' ||
      reason === 'threat' ||
      reason === 'crew' ||
      reason === 'maintenance' ||
      reason === 'other'
    ) {
      return reason;
    }

    return null;
  }

  private afterAction(): void {
    this.movingId = '';
    this.maintenanceId = '';
    this.readinessId = '';
    this.errorMessage = '';
    this.load();
  }

  private failAction(error: unknown, fallback: string): void {
    this.movingId = '';
    this.maintenanceId = '';
    this.readinessId = '';
    this.fail(error, fallback);
  }

  private fail(error: unknown, message: string): void {
    const maybeHttpError = error as { error?: { message?: string } };
    this.errorMessage = maybeHttpError.error?.message || message;
    this.loading = false;
    this.cdr.detectChanges();
  }
}
