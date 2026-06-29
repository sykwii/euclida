import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WeaponModel } from '../../weapon-models/weapon-model.model';
import { WeaponModelsService } from '../../weapon-models/weapon-models.service';
import { Zone } from '../zone.model';
import { ZonesService } from '../zones.service';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-zones-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zones-page.html',
  styleUrl: './zones-page.css',
})
export class ZonesPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  submitting = false;
  items: Zone[] = [];
  weaponModels: WeaponModel[] = [];
  loading = true;
  errorMessage = '';

  form = {
    weaponModelId: '',
    zoneNumber: 1,
    distanceFromM: 0,
    distanceToM: 0,
  };

  constructor(
    private readonly service: ZonesService,
    private readonly weaponModelsService: WeaponModelsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['reference'], () => this.load()));
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
      zones: this.service.getAll(),
      weaponModels: this.weaponModelsService.getAll(),
    }).subscribe({
      next: ({ zones, weaponModels }) => {
        this.items = zones;
        this.weaponModels = weaponModels;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити зони та зразки озброєння';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  create(): void {
    if (this.submitting) {
      return;
    }

    if (!this.form.weaponModelId) {
      return;
    }

    if (this.form.distanceFromM > this.form.distanceToM) {
      this.errorMessage = 'Відстань "від" не може бути більшою за "до"';
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.service.create({
      weaponModelId: this.form.weaponModelId,
      zoneNumber: Number(this.form.zoneNumber),
      distanceFromM: Number(this.form.distanceFromM),
      distanceToM: Number(this.form.distanceToM),
    }).subscribe({
      next: () => {
        this.form.zoneNumber = 1;
        this.form.distanceFromM = 0;
        this.form.distanceToM = 0;
        this.submitting = false;
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося створити зону';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }

  remove(id: string): void {
    if (this.submitting) {
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.service.delete(id).subscribe({
      next: () => {
        this.submitting = false;
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося видалити зону';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }
}