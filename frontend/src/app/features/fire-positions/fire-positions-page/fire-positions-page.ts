import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Unit } from '../../units/unit.model';
import { isUnitChildOf, normalizeUnitType } from '../../units/unit-tree';
import { UnitsService } from '../../units/units.service';
import { FirePosition } from '../fire-position.model';
import { FirePositionsService } from '../fire-positions.service';
import { AuthService } from '../../auth/auth.service';
import { filter, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

type PositionStatusFilter = 'all' | 'combat_ready' | 'not_combat_ready' | 'with_sg';
type PositionType = 'fire_position' | 'aerial_recon' | 'ew_post' | 'ew_station' | 'air_asset_crew';
type PositionPageKind = 'fire_positions' | 'ew' | 'air_assets';

@Component({
  selector: 'app-fire-positions-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fire-positions-page.html',
  styleUrl: './fire-positions-page.css',
})
export class FirePositionsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  items: FirePosition[] = [];
  units: Unit[] = [];
  loading = true;
  errorMessage = '';
  editingId: string | null = null;
  formModalOpen = false;
  returnTo: string | null = null;
  detailsPosition: FirePosition | null = null;
  activeFilter: PositionStatusFilter = 'all';
  pageKind: PositionPageKind = 'fire_positions';
  collapsedForeignUnits: Record<string, boolean> = {};
  pageSkeleton = Array.from({ length: 6 });

  form = this.getEmptyForm();

  constructor(
    private readonly service: FirePositionsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly auth: AuthService,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.syncPageKindFromUrl(this.router.url);

    this.route.queryParamMap.subscribe((params) => {
      this.returnTo = params.get('returnTo');
      const editId = params.get('editId');

      if (editId) this.startEdit(editId);
    });

    this.autoRefreshSubscription.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe((event) => {
          const previousPageKind = this.pageKind;

          this.syncPageKindFromUrl(event.urlAfterRedirects);

          if (previousPageKind !== this.pageKind) {
            this.activeFilter = 'all';
            this.formModalOpen = false;
            this.editingId = null;
            this.detailsPosition = null;
            this.form = this.getEmptyForm();
            this.load();
          }
        }),
    );

    this.load();

    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'map', 'missions', 'weapons', 'threats'], () => this.load()),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
  }

  get totalCount(): number {
    return this.ownItems.length;
  }

  get isEwPage(): boolean {
    return this.pageKind === 'ew';
  }

  get isAirAssetsPage(): boolean {
    return this.pageKind === 'air_assets';
  }

  get pageEyebrow(): string {
    if (this.isAirAssetsPage) return 'ПОВІТРЯ';
    return this.isEwPage ? 'РЕБ' : 'ВП';
  }

  get pageTitle(): string {
    if (this.isAirAssetsPage) return 'Розрахунки повітряних засобів';
    return this.isEwPage ? 'Позиції РЕБ' : 'Вогневі позиції';
  }

  get pageDescription(): string {
    if (this.isAirAssetsPage) {
      return 'Окремий облік розрахунків БпЛА, екіпажів та повітряних засобів';
    }

    return this.isEwPage
      ? 'Аеророзвідка, пости РЕБ та станції РЕБ'
      : 'Координати, готовність, локальний БК та прив’язка Озброєння';
  }

  get createButtonLabel(): string {
    if (this.isAirAssetsPage) return 'Додати розрахунок';
    return this.isEwPage ? 'Додати РЕБ' : 'Додати ВП';
  }

  get positionTypeOptions(): Array<{ value: PositionType; label: string }> {
    if (this.isAirAssetsPage) {
      return [{ value: 'air_asset_crew', label: 'Розрахунок повітряних засобів' }];
    }

    return this.isEwPage
      ? [
          { value: 'aerial_recon', label: 'Аеророзвідка' },
          { value: 'ew_post', label: 'Пост РЕБ' },
          { value: 'ew_station', label: 'Станція РЕБ' },
        ]
      : [{ value: 'fire_position', label: 'Вогнева позиція' }];
  }

  get readyCount(): number {
    return this.ownItems.filter(
      (x) => this.normalizeReadiness(x.readinessStatus) === 'combat_ready',
    ).length;
  }

  get notReadyCount(): number {
    return this.ownItems.filter(
      (x) => this.normalizeReadiness(x.readinessStatus) === 'not_combat_ready',
    ).length;
  }

  get withSgCount(): number {
    return this.ownItems.filter((x) => x.hasSg).length;
  }

  get filteredOwnItems(): FirePosition[] {
    if (this.activeFilter === 'all') {
      return this.ownItems;
    }

    if (this.activeFilter === 'with_sg') {
      return this.ownItems.filter((item) => item.hasSg);
    }

    return this.ownItems.filter(
      (item) => this.normalizeReadiness(item.readinessStatus) === this.activeFilter,
    );
  }

  get activeFilterLabel(): string {
    const labels: Record<PositionStatusFilter, string> = {
      all: 'Всі',
      combat_ready: 'БГ',
      not_combat_ready: 'НЕ БГ',
      with_sg: 'З Озброєнням',
    };

    return labels[this.activeFilter];
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.service.getAll().subscribe({
      next: (items) => {
        this.items = items;
        if (this.detailsPosition) {
          this.detailsPosition = items.find((item) => item.id === this.detailsPosition?.id) ?? null;
        }
        this.loadUnits();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити точки'),
    });
  }

  setFilter(filter: PositionStatusFilter): void {
    this.activeFilter = filter;
  }

  clearFilter(): void {
    this.activeFilter = 'all';
  }

  private loadUnits(): void {
    this.unitsService.getAll().subscribe({
      next: (units) => {
        this.units = units;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити підрозділи'),
    });
  }

  save(): void {
    this.errorMessage = '';

    if (!this.form.name.trim()) {
      this.errorMessage = 'Вкажіть назву точки';
      return;
    }

    if (this.form.coordinateMode === 'decimal' && (!this.form.lat || !this.form.lng)) {
      this.errorMessage = 'Вкажіть Lat/Lng';
      return;
    }

    if (this.form.mgrs.trim()) {
      this.normalizeFormMgrs();
    }

    if (this.form.coordinateMode === 'mgrs' && !this.form.mgrs.trim()) {
      this.errorMessage = 'Вкажіть MGRS';
      return;
    }

    if (this.form.mgrs.trim() && !this.isValidMgrs(this.form.mgrs)) {
      this.errorMessage = 'Некоректний MGRS. Формат: 36U XB 11111 22222';
      return;
    }

    const formattedMgrs = this.formatMgrs(this.form.mgrs, '');

    const body = {
      name: this.form.name.trim(),
      positionType: this.form.positionType as PositionType,
      ...(this.form.unitId ? { unitId: this.form.unitId } : {}),

      ...(this.form.coordinateMode === 'decimal'
        ? {
            lat: Number(this.form.lat),
            lng: Number(this.form.lng),
            ...(formattedMgrs ? { mgrs: formattedMgrs } : {}),
          }
        : {
            mgrs: formattedMgrs,
          }),

      ...(this.form.mainDirectionUnits
        ? { mainDirectionUnits: Number(this.form.mainDirectionUnits) }
        : {}),
      ...(this.form.traverseLeftUnits
        ? { traverseLeftUnits: Number(this.form.traverseLeftUnits) }
        : {}),
      ...(this.form.traverseRightUnits
        ? { traverseRightUnits: Number(this.form.traverseRightUnits) }
        : {}),
      personnelRotationDate: this.form.personnelRotationDate || undefined,
    };

    const request = this.editingId
      ? this.service.update(this.editingId, body)
      : this.service.create(body);

    request.subscribe({
      next: () => {
        if (this.returnTo === 'map') {
          void this.router.navigate(['/map']);
          return;
        }

        this.cancelEdit();
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося зберегти точку'),
    });
  }

  startEdit(id: string): void {
    this.service.getOne(id).subscribe({
      next: (item) => {
        this.editingId = item.id;
        this.formModalOpen = true;

        this.form = {
          name: item.name,
          positionType: this.normalizePositionType(item.positionType),
          unitId: item.unitId || '',
          coordinateMode: 'decimal',
          lat: String(item.lat),
          lng: String(item.lng),
          mgrs: this.formatMgrs(item.mgrs, ''),
          mainDirectionUnits:
            item.mainDirectionUnits !== null ? String(item.mainDirectionUnits) : '',
          traverseLeftUnits: item.traverseLeftUnits !== null ? String(item.traverseLeftUnits) : '',
          traverseRightUnits:
            item.traverseRightUnits !== null ? String(item.traverseRightUnits) : '',
          personnelRotationStatus: item.personnelRotationStatus || '',
          personnelRotationDate: item.personnelRotationDate
            ? item.personnelRotationDate.slice(0, 10)
            : '',
        };

        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити точку для редагування'),
    });
  }

  cancelEdit(): void {
    this.editingId = null;
    this.formModalOpen = false;
    this.form = this.getEmptyForm();

    if (this.returnTo === 'map') {
      void this.router.navigate(['/map']);
      return;
    }

    void this.router.navigate([
      this.isAirAssetsPage ? '/air-assets' : this.isEwPage ? '/ew' : '/fire-positions',
    ]);
    this.cdr.detectChanges();
  }

  openCreate(): void {
    this.editingId = null;
    this.form = this.getEmptyForm();
    this.formModalOpen = true;
    this.cdr.detectChanges();
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити точку'),
    });
  }

  openDetails(item: FirePosition): void {
    this.detailsPosition = item;
  }

  closeDetails(): void {
    this.detailsPosition = null;
  }

  onMgrsInput(value: string): void {
    this.form.mgrs = this.formatMgrs(value, '');
  }

  normalizeFormMgrs(): void {
    this.form.mgrs = this.formatMgrs(this.form.mgrs, '');
  }

  isValidMgrs(value: string | null | undefined): boolean {
    const compact = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

    return /^\d{1,2}[C-X][A-Z]{2}\d{10}$/.test(compact);
  }

  formatMgrs(value: string | null | undefined, emptyValue = '—'): string {
    const raw = (value ?? '').trim();

    if (!raw) {
      return emptyValue;
    }

    const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const match = compact.match(/^(\d{1,2}[C-X])([A-Z]{2})(\d{5})(\d{5})$/);

    if (!match) {
      return raw.toUpperCase().replace(/\s+/g, ' ');
    }

    const [, zone, square, easting, northing] = match;

    return `${zone} ${square} ${easting} ${northing}`;
  }

  getReadinessLabel(status: string): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'БГ' : 'НЕ БГ';
  }

  getReadinessClass(status: string): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'ready' : 'danger';
  }

  private getEmptyForm(): {
    name: string;
    positionType: PositionType;
    unitId: string;
    coordinateMode: 'decimal' | 'mgrs';
    lat: string;
    lng: string;
    mgrs: string;
    mainDirectionUnits: string;
    traverseLeftUnits: string;
    traverseRightUnits: string;
    personnelRotationStatus: string;
    personnelRotationDate: string;
  } {
    return {
      name: '',
      positionType:
        this.pageKind === 'air_assets'
          ? 'air_asset_crew'
          : this.pageKind === 'ew'
            ? 'ew_post'
            : 'fire_position',
      unitId: '',
      coordinateMode: 'decimal',
      lat: '',
      lng: '',
      mgrs: '',
      mainDirectionUnits: '',
      traverseLeftUnits: '',
      traverseRightUnits: '',
      personnelRotationStatus: '',
      personnelRotationDate: '',
    };
  }

  private syncPageKindFromUrl(url: string): void {
    const cleanUrl = url.split('?')[0];

    if (cleanUrl.startsWith('/air-assets')) {
      this.pageKind = 'air_assets';
      return;
    }

    if (cleanUrl.startsWith('/ew')) {
      this.pageKind = 'ew';
      return;
    }

    this.pageKind = 'fire_positions';
  }

  private normalizePositionType(value: string | null | undefined): PositionType {
    const allowed = this.positionTypeOptions.map((option) => option.value);

    if (value && allowed.includes(value as PositionType)) {
      return value as PositionType;
    }

    return this.isAirAssetsPage ? 'air_asset_crew' : this.isEwPage ? 'ew_post' : 'fire_position';
  }

  private fail(error: unknown, message: string): void {
    const maybeHttpError = error as { error?: { message?: string } };
    this.errorMessage = maybeHttpError.error?.message || message;
    this.loading = false;
    this.cdr.detectChanges();
  }

  getWeaponReadinessLabel(status: string | undefined): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'СГ БГ' : 'СГ НЕ БГ';
  }

  getWeaponReadinessClass(status: string | undefined): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'ready' : 'danger';
  }

  getWeaponDeploymentLabel(item: FirePosition): string {
    const status = item.assignedWeapon?.deploymentStatus;
    const labels: Record<string, string> = {
      reserve_area: 'РЗ',
      moving_to_fire_position: 'рух до ВП',
      at_fire_position: 'на ВП',
      moving_to_reserve_area: 'рух до РЗ',
    };

    return labels[status || 'at_fire_position'] ?? 'на ВП';
  }

  getWeaponDeploymentClass(item: FirePosition): string {
    return (item.assignedWeapon?.deploymentStatus || 'at_fire_position').replace(/_/g, '-');
  }

  getIncomingDeploymentLabel(item: FirePosition): string {
    const status = item.incomingDeployment?.status;

    if (status === 'moving') {
      return 'У русі до ВП';
    }

    return 'Призначено, очікує руху';
  }

  getFpReadinessLabel(status: string): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'ВП БГ' : 'ВП НЕ БГ';
  }

  isFpCombatReady(item: FirePosition): boolean {
    return this.normalizeReadiness(item.readinessStatus) === 'combat_ready';
  }

  getWeaponReadinessLabelUa(status: string | undefined): string {
    return this.normalizeReadiness(status) === 'combat_ready' ? 'СГ БГ' : 'СГ НЕ БГ';
  }

  getWeaponDeploymentLabelUa(item: FirePosition): string {
    const status = item.assignedWeapon?.deploymentStatus;
    const labels: Record<string, string> = {
      reserve_area: 'Район зосередження',
      moving_to_fire_position: 'Рух до ВП',
      at_fire_position: 'На ВП',
      moving_to_reserve_area: 'Рух до РЗ',
    };

    return labels[status || 'at_fire_position'] ?? 'На ВП';
  }

  getAggregateReadinessLabel(item: FirePosition): string {
    return item.operationalState.ready ? 'Готова до вогню' : 'Не готова до вогню';
  }

  getAggregateReadinessClass(item: FirePosition): string {
    return item.operationalState.ready ? 'ready' : 'danger';
  }

  getAggregateReasonLabels(item: FirePosition): string[] {
    return item.operationalState.reasonLabel ? [item.operationalState.reasonLabel] : [];
  }

  private normalizeReadiness(
    status: string | null | undefined,
  ): 'combat_ready' | 'not_combat_ready' {
    return status === 'combat_ready' || status === 'ready' || status === 'ready_for_combat'
      ? 'combat_ready'
      : 'not_combat_ready';
  }

  getRotationDays(date: string | null): string {
    if (!date) return '—';

    const rotationTime = new Date(date).getTime();
    const now = Date.now();
    const days = Math.floor((now - rotationTime) / 86_400_000);

    return `${Math.max(0, days)} дн.`;
  }

  get availableUnits() {
    const user = this.auth.getUser();

    if (!user) {
      return [];
    }

    const positionUnits = this.units.filter((unit) =>
      ['battery', 'platoon', 'squad'].includes(normalizeUnitType(unit)),
    );

    if (user.role === 'admin' || user.scope === 'main') {
      return positionUnits;
    }

    if (!user.unitId) {
      return [];
    }

    if (user.scope === 'battery') {
      return positionUnits.filter(
        (unit) => unit.id === user.unitId || unit.parentId === user.unitId,
      );
    }

    if (user.scope === 'division') {
      return positionUnits.filter(
        (unit) => unit.parentId === user.unitId || isUnitChildOf(this.units, unit.id, user.unitId!),
      );
    }

    return [];
  }

  get ownItems(): FirePosition[] {
    return this.items.filter((item) => !item.publicViewOnly && this.matchesPageType(item));
  }

  get foreignItems(): FirePosition[] {
    return this.items.filter((item) => item.publicViewOnly && this.matchesPageType(item));
  }

  private matchesPageType(item: FirePosition): boolean {
    const positionType = item.positionType || 'fire_position';

    if (this.isAirAssetsPage) {
      return positionType === 'air_asset_crew';
    }

    if (this.isEwPage) {
      return ['aerial_recon', 'ew_post', 'ew_station'].includes(positionType);
    }

    return positionType === 'fire_position';
  }

  get foreignGroups(): Array<{
    unitId: string;
    unitName: string;
    items: FirePosition[];
  }> {
    const groups = new Map<
      string,
      {
        unitId: string;
        unitName: string;
        items: FirePosition[];
      }
    >();

    for (const item of this.foreignItems) {
      const unitId = item.unit?.id ?? item.unitId ?? 'unknown';
      const unitName = item.unit?.name ?? 'Без підрозділу';
      const existingGroup = groups.get(unitId);

      if (existingGroup) {
        existingGroup.items.push(item);
      } else {
        groups.set(unitId, {
          unitId,
          unitName,
          items: [item],
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.unitName.localeCompare(b.unitName));
  }

  isForeignGroupOpen(unitId: string): boolean {
    return this.collapsedForeignUnits[unitId] ?? false;
  }

  toggleForeignGroup(unitId: string): void {
    this.collapsedForeignUnits[unitId] = !this.isForeignGroupOpen(unitId);
  }

  isPositionAvailableForTransfer(item: FirePosition): boolean {
    return !item.hasSg;
  }
}
