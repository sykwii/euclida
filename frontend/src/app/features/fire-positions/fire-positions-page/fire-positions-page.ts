import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Unit } from '../../units/unit.model';
import { UnitsService } from '../../units/units.service';
import { FirePosition } from '../fire-position.model';
import { FirePositionsService } from '../fire-positions.service';
import { WeaponSystem } from '../../weapon-systems/weapon-system.model';
import { WeaponSystemsService } from '../../weapon-systems/weapon-systems.service';
import { AuthService } from '../../auth/auth.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

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
weapons: WeaponSystem[] = [];
  loading = true;
  errorMessage = '';
  editingId: string | null = null;
  returnTo: string | null = null;

collapsedForeignUnits: Record<string, boolean> = {};
  pageSkeleton = Array.from({ length: 6 });

  form = this.getEmptyForm();

  constructor(
    private readonly service: FirePositionsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly weaponSystemsService: WeaponSystemsService,
    private readonly auth: AuthService,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      this.returnTo = params.get('returnTo');
      const editId = params.get('editId');

      if (editId) this.startEdit(editId);
    });

    this.load();
    this.autoRefreshSubscription.add(
      this.autoRefresh.watch(['all', 'map', 'missions', 'weapons', 'threats'], () => this.load()),
    );
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
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

  get withSgCount(): number {
    return this.items.filter((x) => x.hasSg).length;
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.service.getAll().subscribe({
      next: (items) => {
        this.items = items;
        this.loadUnits();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити точки'),
    });
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

      ...(this.form.mainDirectionUnits ? { mainDirectionUnits: Number(this.form.mainDirectionUnits) } : {}),
      ...(this.form.traverseLeftUnits ? { traverseLeftUnits: Number(this.form.traverseLeftUnits) } : {}),
      ...(this.form.traverseRightUnits ? { traverseRightUnits: Number(this.form.traverseRightUnits) } : {}),

     
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

        this.form = {
          name: item.name,
          unitId: item.unitId || '',
          coordinateMode: 'decimal',
          lat: String(item.lat),
          lng: String(item.lng),
          mgrs: this.formatMgrs(item.mgrs, ''),
          mainDirectionUnits: item.mainDirectionUnits !== null ? String(item.mainDirectionUnits) : '',
          traverseLeftUnits: item.traverseLeftUnits !== null ? String(item.traverseLeftUnits) : '',
          traverseRightUnits: item.traverseRightUnits !== null ? String(item.traverseRightUnits) : '',
          
         
          
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
    this.form = this.getEmptyForm();

    if (this.returnTo === 'map') {
      void this.router.navigate(['/map']);
      return;
    }

    void this.router.navigate(['/fire-positions']);
    this.cdr.detectChanges();
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити точку'),
    });
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

  getReadinessLabel(status: string): string {    if (status === 'ready') return 'БГ';
    if (status === 'not_ready') return 'НЕ БГ';
    if (status === 'in_progress') return 'В роботі';
    return 'Невідомо';
  }

  getReadinessClass(status: string): string {
    if (status === 'ready') return 'ready';
    if (status === 'not_ready') return 'danger';
    if (status === 'in_progress') return 'progress';
    return 'unknown';
  }

  private getEmptyForm() {
    return {
      name: '',
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

  private fail(error: unknown, message: string): void {
        this.errorMessage = message;
    this.loading = false;
    this.cdr.detectChanges();
  }

  getWeaponReadinessLabel(status: string | undefined): string {
  if (status === 'ready') return 'СГ БГ';
  if (status === 'not_ready') return 'СГ НЕ БГ';
  if (status === 'repair') return 'СГ ремонт';
  return 'СГ невідомо';
}

getWeaponReadinessClass(status: string | undefined): string {
  if (status === 'ready') return 'ready';
  if (status === 'not_ready') return 'danger';
  if (status === 'repair') return 'repair';
  return 'unknown';
}


get availableWeapons(): WeaponSystem[] {
  const user = this.auth.getUser();

  if (!user) {
    return [];
  }

  return this.weapons.filter((weapon) => {
    if (
      weapon.locationType === 'fire_position' &&
      weapon.firePositionId !== this.editingId
    ) {
      return false;
    }

    if (user.role === 'admin' || user.scope === 'main') {
      if (this.form.unitId && weapon.unitId && weapon.unitId !== this.form.unitId) {
        return false;
      }

      return true;
    }

    if (user.scope === 'battery') {
      return weapon.unitId === user.unitId;
    }

    if (user.scope === 'division') {
      return this.availableUnits.some((unit) => unit.id === weapon.unitId);
    }

    return false;
  });
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

get ownItems(): FirePosition[] {
  return this.items.filter((item) => !item.publicViewOnly);
}

get foreignItems(): FirePosition[] {
  return this.items.filter((item) => item.publicViewOnly);
}

get foreignGroups(): Array<{
  unitId: string;
  unitName: string;
  items: FirePosition[];
}> {
  const groups = new Map<string, {
    unitId: string;
    unitName: string;
    items: FirePosition[];
  }>();

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

  return Array.from(groups.values()).sort((a, b) =>
    a.unitName.localeCompare(b.unitName),
  );
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
