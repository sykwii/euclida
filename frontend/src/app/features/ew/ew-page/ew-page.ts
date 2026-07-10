import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { submitForm } from '../../../core/form-submit';
import { Unit } from '../../units/unit.model';
import { UnitsService } from '../../units/units.service';
import { CreateEwPositionRequest, EwEffectMode, EwFrequencyRange, EwPosition, EwReadinessStatus } from '../ew-position.model';
import { EwPositionsService } from '../ew-positions.service';

type CoordinateMode = 'decimal' | 'mgrs';

type EwFrequencyRangeForm = {
  label: string;
  frequencyFromMhz: string;
  frequencyToMhz: string;
};

type EwForm = {
  name: string;
  unitId: string;
  callsign: string;
  stationName: string;
  coordinateMode: CoordinateMode;
  lat: string;
  lng: string;
  mgrs: string;
  effectMode: EwEffectMode;
  radiusM: string;
  mainDirectionUnits: string;
  traverseLeftUnits: string;
  traverseRightUnits: string;
  readinessStatus: EwReadinessStatus;
  notReadyReason: string;
  personnelRotationDate: string;
  note: string;
  frequencyRanges: EwFrequencyRangeForm[];
};

@Component({
  selector: 'app-ew-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ew-page.html',
  styleUrl: './ew-page.css',
})
export class EwPage implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();
  items: EwPosition[] = [];
  units: Unit[] = [];
  loading = true;
  submitting = false;
  errorMessage = '';
  editingId: string | null = null;
  formModalOpen = false;
  detailsItem: EwPosition | null = null;
  form: EwForm = this.getEmptyForm();

  constructor(
    private readonly service: EwPositionsService,
    private readonly unitsService: UnitsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.subscriptions.add(this.autoRefresh.watch(['all', 'map', 'threats'], () => this.load()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  get readyCount(): number {
    return this.items.filter((item) => item.readinessStatus === 'ready').length;
  }

  get notReadyCount(): number {
    return this.items.filter((item) => item.readinessStatus === 'not_ready').length;
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      items: this.service.getAll(),
      units: this.unitsService.getAll(),
    }).subscribe({
      next: ({ items, units }) => {
        this.items = items;
        this.units = units;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити позиції РЕБ'),
    });
  }

  openCreate(): void {
    this.editingId = null;
    this.form = this.getEmptyForm();
    this.formModalOpen = true;
  }

  startEdit(item: EwPosition): void {
    this.editingId = item.id;
    this.form = {
      name: item.name,
      unitId: item.unitId,
      callsign: item.callsign,
      stationName: item.stationName,
      coordinateMode: 'decimal',
      lat: String(item.lat ?? ''),
      lng: String(item.lng ?? ''),
      mgrs: item.mgrs ?? '',
      effectMode: item.effectMode,
      radiusM: item.radiusM !== null && item.radiusM !== undefined ? String(item.radiusM) : '',
      mainDirectionUnits: item.mainDirectionUnits !== null && item.mainDirectionUnits !== undefined ? String(item.mainDirectionUnits) : '',
      traverseLeftUnits: item.traverseLeftUnits !== null && item.traverseLeftUnits !== undefined ? String(item.traverseLeftUnits) : '',
      traverseRightUnits: item.traverseRightUnits !== null && item.traverseRightUnits !== undefined ? String(item.traverseRightUnits) : '',
      readinessStatus: item.readinessStatus === 'not_ready' ? 'not_ready' : 'ready',
      notReadyReason: item.notReadyReason ?? '',
      personnelRotationDate: item.personnelRotationDate ? item.personnelRotationDate.slice(0, 10) : '',
      note: item.note ?? '',
      frequencyRanges: (item.frequencyRanges ?? []).map((range) => ({
        label: range.label ?? '',
        frequencyFromMhz: String(range.frequencyFromMhz),
        frequencyToMhz: String(range.frequencyToMhz),
      })),
    };

    if (this.form.frequencyRanges.length === 0) this.addFrequencyRange();
    this.formModalOpen = true;
    this.cdr.detectChanges();
  }

  cancelEdit(): void {
    this.editingId = null;
    this.formModalOpen = false;
    this.form = this.getEmptyForm();
  }

  save(): void {
    const body = this.buildRequestBody();

    if (!body) {
      this.cdr.detectChanges();
      return;
    }

    const request = this.editingId ? this.service.update(this.editingId, body) : this.service.create(body);

    submitForm(request, {
      begin: () => this.beginSubmit(),
      success: () => {
        this.cancelEdit();
        this.load();
      },
      fail: (error) => this.fail(error, (error as any)?.error?.message || 'Не вдалося зберегти позицію РЕБ'),
      finish: () => this.finishSubmit(),
    });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити позицію РЕБ'),
    });
  }

  openDetails(item: EwPosition): void {
    this.detailsItem = item;
  }

  closeDetails(): void {
    this.detailsItem = null;
  }

  addFrequencyRange(): void {
    this.form.frequencyRanges.push({ label: '', frequencyFromMhz: '', frequencyToMhz: '' });
  }

  removeFrequencyRange(index: number): void {
    this.form.frequencyRanges.splice(index, 1);
    if (this.form.frequencyRanges.length === 0) this.addFrequencyRange();
  }

  getReadinessLabel(status: string): string {
    return status === 'ready' ? 'БГ' : 'НЕ БГ';
  }

  getEffectModeLabel(mode: string): string {
    return mode === 'sector' ? 'Сектор дії' : 'Радіус дії';
  }

  formatFrequencyRanges(ranges: EwFrequencyRange[] | undefined): string {
    if (!ranges?.length) return '—';

    return ranges
      .map((range) => {
        const label = range.label ? `${range.label}: ` : '';
        return `${label}${range.frequencyFromMhz}–${range.frequencyToMhz} МГц`;
      })
      .join('; ');
  }

  private buildRequestBody(): CreateEwPositionRequest | null {
    this.errorMessage = '';

    if (!this.form.name.trim()) {
      this.errorMessage = 'Вкажіть позицію РЕБ';
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

    if (!this.form.stationName.trim()) {
      this.errorMessage = 'Вкажіть станцію РЕБ';
      return null;
    }

    if (this.form.coordinateMode === 'decimal' && (!this.form.lat || !this.form.lng)) {
      this.errorMessage = 'Вкажіть Lat/Lng';
      return null;
    }

    if (this.form.coordinateMode === 'mgrs' && !this.form.mgrs.trim()) {
      this.errorMessage = 'Вкажіть MGRS';
      return null;
    }

    const frequencyRanges = this.form.frequencyRanges
      .filter((range) => {
        const from = Number(range.frequencyFromMhz);
        const to = Number(range.frequencyToMhz);
        return Number.isFinite(from) || Number.isFinite(to) || range.label.trim();
      })
      .map((range) => ({
        ...(range.label.trim() ? { label: range.label.trim() } : {}),
        frequencyFromMhz: Number(range.frequencyFromMhz),
        frequencyToMhz: Number(range.frequencyToMhz),
      }));

    if (frequencyRanges.length === 0) {
      this.errorMessage = 'Додайте хоча б один діапазон частот';
      return null;
    }

    if (
      frequencyRanges.some(
        (range) => Number.isNaN(range.frequencyFromMhz) || Number.isNaN(range.frequencyToMhz) || range.frequencyToMhz < range.frequencyFromMhz,
      )
    ) {
      this.errorMessage = 'Перевірте діапазони частот';
      return null;
    }

    if (this.form.effectMode === 'radius' && !this.form.radiusM) {
      this.errorMessage = 'Вкажіть радіус дії';
      return null;
    }

    if (this.form.effectMode === 'sector' && (!this.form.mainDirectionUnits || !this.form.traverseLeftUnits || !this.form.traverseRightUnits)) {
      this.errorMessage = 'Для сектору вкажіть ОН, лівий та правий довороти';
      return null;
    }

    return {
      name: this.form.name.trim(),
      unitId: this.form.unitId,
      callsign: this.form.callsign.trim(),
      stationName: this.form.stationName.trim(),
      ...(this.form.coordinateMode === 'decimal'
        ? {
            lat: Number(this.form.lat),
            lng: Number(this.form.lng),
            ...(this.form.mgrs.trim() ? { mgrs: this.form.mgrs.trim() } : {}),
          }
        : { mgrs: this.form.mgrs.trim() }),
      effectMode: this.form.effectMode,
      ...(this.form.effectMode === 'radius' ? { radiusM: Number(this.form.radiusM) } : {}),
      ...(this.form.effectMode === 'sector'
        ? {
            mainDirectionUnits: Number(this.form.mainDirectionUnits),
            traverseLeftUnits: Number(this.form.traverseLeftUnits),
            traverseRightUnits: Number(this.form.traverseRightUnits),
          }
        : {}),
      readinessStatus: this.form.readinessStatus,
      ...(this.form.readinessStatus === 'not_ready' && this.form.notReadyReason.trim() ? { notReadyReason: this.form.notReadyReason.trim() } : {}),
      ...(this.form.personnelRotationDate ? { personnelRotationDate: this.form.personnelRotationDate } : {}),
      ...(this.form.note.trim() ? { note: this.form.note.trim() } : {}),
      frequencyRanges,
    };
  }

  private getEmptyForm(): EwForm {
    return {
      name: '',
      unitId: '',
      callsign: '',
      stationName: '',
      coordinateMode: 'decimal',
      lat: '',
      lng: '',
      mgrs: '',
      effectMode: 'radius',
      radiusM: '',
      mainDirectionUnits: '',
      traverseLeftUnits: '',
      traverseRightUnits: '',
      readinessStatus: 'ready',
      notReadyReason: '',
      personnelRotationDate: '',
      note: '',
      frequencyRanges: [{ label: '', frequencyFromMhz: '', frequencyToMhz: '' }],
    };
  }

  private beginSubmit(): void {
    this.errorMessage = '';
    this.submitting = true;
    this.cdr.detectChanges();
  }

  private finishSubmit(): void {
    this.submitting = false;
    this.cdr.detectChanges();
  }

  private fail(error: unknown, message: string): void {
    if ((error as { status?: number })?.status === 401) {
      this.errorMessage = '';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.errorMessage = message;
    this.loading = false;
    this.cdr.detectChanges();
  }
}
