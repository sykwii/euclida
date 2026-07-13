import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { Charge } from '../../charges/charge.model';
import { ChargesService } from '../../charges/charges.service';
import { Fuze } from '../../fuzes/fuze.model';
import { FuzesService } from '../../fuzes/fuzes.service';
import { Primer } from '../../primers/primer.model';
import { PrimersService } from '../../primers/primers.service';
import { Shell } from '../../shells/shell.model';
import { ShellsService } from '../../shells/shells.service';
import { WeaponModel } from '../../weapon-models/weapon-model.model';
import { WeaponModelsService } from '../../weapon-models/weapon-models.service';
import { ShotConfiguration } from '../shot-configuration.model';
import { ShotConfigurationsService } from '../shot-configurations.service';

interface ShotConfigurationChargeFormItem {
  chargeId: string;
  quantityPerShot: number;
  accountingUnit: 'piece' | 'module';
}

@Component({
  selector: 'app-shot-configurations-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shot-configurations-page.html',
  styleUrl: './shot-configurations-page.css',
})
export class ShotConfigurationsPage implements OnInit, OnDestroy {
  private readonly subscriptions = new Subscription();

  loading = true;
  saving = false;
  errorMessage = '';
  items: ShotConfiguration[] = [];
  weaponModels: WeaponModel[] = [];
  shells: Shell[] = [];
  charges: Charge[] = [];
  fuzes: Fuze[] = [];
  primers: Primer[] = [];
  editingId: string | null = null;

  form = {
    name: '',
    weaponModelId: '',
    shellId: '',
    fuzeId: '',
    primerId: '',
    zoneNumber: '' as string | number,
    maxRangeM: 1000,
    isActive: false,
    note: '',
    charges: [
      { chargeId: '', quantityPerShot: 1, accountingUnit: 'piece' as const },
    ] as ShotConfigurationChargeFormItem[],
  };

  constructor(
    private readonly service: ShotConfigurationsService,
    private readonly weaponModelsService: WeaponModelsService,
    private readonly shellsService: ShellsService,
    private readonly chargesService: ChargesService,
    private readonly fuzesService: FuzesService,
    private readonly primersService: PrimersService,
    private readonly autoRefresh: AutoRefreshService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.subscriptions.add(
      this.autoRefresh.watch(['reference', 'stock'], () => this.load()),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      items: this.service.getAll(),
      weaponModels: this.weaponModelsService.getAll(),
      shells: this.shellsService.getAll(),
      charges: this.chargesService.getAll(),
      fuzes: this.fuzesService.getAll(),
      primers: this.primersService.getAll(),
    }).subscribe({
      next: (data) => {
        this.items = data.items;
        this.weaponModels = data.weaponModels;
        this.shells = data.shells;
        this.charges = data.charges;
        this.fuzes = data.fuzes;
        this.primers = data.primers;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Не вдалося завантажити комплекти пострілу';
        this.cdr.detectChanges();
      },
    });
  }

  addChargeRow(): void {
    this.form.charges.push({
      chargeId: '',
      quantityPerShot: 1,
      accountingUnit: 'piece',
    });
  }

  removeChargeRow(index: number): void {
    if (this.form.charges.length <= 1) {
      return;
    }

    this.form.charges.splice(index, 1);
  }

  onChargeChange(item: ShotConfigurationChargeFormItem): void {
    const charge = this.charges.find((entry) => entry.id === item.chargeId);
    item.accountingUnit = charge?.chargeKind === 'modular' ? 'module' : 'piece';
  }

  edit(item: ShotConfiguration): void {
    this.editingId = item.id;
    this.form = {
      name: item.name,
      weaponModelId: item.weaponModelId,
      shellId: item.shellId,
      fuzeId: item.fuzeId ?? '',
      primerId: item.primerId ?? '',
      zoneNumber: item.zoneNumber ?? '',
      maxRangeM: item.maxRangeM,
      isActive: item.isActive,
      note: item.note ?? '',
      charges: item.charges.map((charge) => ({
        chargeId: charge.chargeId,
        quantityPerShot: charge.quantityPerShot,
        accountingUnit: charge.accountingUnit,
      })),
    };
  }

  resetForm(): void {
    this.editingId = null;
    this.form = {
      name: '',
      weaponModelId: '',
      shellId: '',
      fuzeId: '',
      primerId: '',
      zoneNumber: '',
      maxRangeM: 1000,
      isActive: false,
      note: '',
      charges: [{ chargeId: '', quantityPerShot: 1, accountingUnit: 'piece' }],
    };
  }

  save(): void {
    if (this.saving) {
      return;
    }

    const name = this.form.name.trim();
    const zoneNumberValue =
      this.form.zoneNumber === '' ? null : Number(this.form.zoneNumber);
    const charges = this.form.charges.map((item, index) => ({
      chargeId: item.chargeId,
      quantityPerShot: Number(item.quantityPerShot),
      accountingUnit: item.accountingUnit,
      sortOrder: index,
    }));

    if (
      !name ||
      !this.form.weaponModelId ||
      !this.form.shellId ||
      charges.some(
        (item) =>
          !item.chargeId ||
          !Number.isInteger(item.quantityPerShot) ||
          item.quantityPerShot <= 0,
      )
    ) {
      this.errorMessage =
        'Заповніть назву, модель, снаряд і всі компоненти заряду';
      return;
    }

    if (
      this.form.isActive &&
      (!this.form.fuzeId ||
        !this.form.primerId ||
        !Number.isInteger(zoneNumberValue) ||
        Number(zoneNumberValue) <= 0 ||
        Number(this.form.maxRangeM) <= 0)
    ) {
      this.errorMessage =
        'Активний комплект має містити підривник, праймер, номер зони та додатну максимальну дальність';
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    const request = {
      name,
      weaponModelId: this.form.weaponModelId,
      shellId: this.form.shellId,
      fuzeId: this.form.fuzeId || null,
      primerId: this.form.primerId || null,
      zoneNumber: zoneNumberValue,
      maxRangeM: Number(this.form.maxRangeM),
      isActive: this.form.isActive,
      note: this.form.note.trim() || null,
      charges,
    };

    const save$ = this.editingId
      ? this.service.update(this.editingId, request)
      : this.service.create(request);

    save$.subscribe({
      next: () => {
        this.saving = false;
        this.resetForm();
        this.load();
      },
      error: (error) => {
        this.saving = false;
        this.errorMessage =
          error?.error?.message || 'Не вдалося зберегти комплект пострілу';
        this.cdr.detectChanges();
      },
    });
  }

  toggleActive(item: ShotConfiguration): void {
    this.service.activate(item.id, !item.isActive).subscribe({
      next: () => this.load(),
      error: (error) => {
        this.errorMessage =
          error?.error?.message || 'Не вдалося оновити статус комплекту';
        this.cdr.detectChanges();
      },
    });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => {
        this.errorMessage =
          error?.error?.message || 'Не вдалося видалити комплект пострілу';
        this.cdr.detectChanges();
      },
    });
  }

  getChargeLabel(item: ShotConfiguration): string {
    return item.charges
      .map(
        (charge) =>
          `${charge.charge.marking} × ${charge.quantityPerShot} ${charge.accountingUnit === 'module' ? 'мод.' : 'шт.'}`,
      )
      .join(', ');
  }
}
