import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SettingsService } from '../settings.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.css',
})
export class SettingsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  saving = false;
  loading = true;
  errorMessage = '';
  successMessage = '';

  form = {
    airThreatRadiusM: 3000,
  };

  constructor(
    private readonly service: SettingsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['settings'], () => this.load()));
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
    this.loadSubscription?.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';
    this.loadSubscription?.unsubscribe();

    this.loadSubscription = this.service.getAirThreatRadius().subscribe({
      next: (data) => {
        this.form.airThreatRadiusM = data.radiusM;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити налаштування';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  save(): void {
    if (this.saving) {
      return;
    }

    this.saving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.service.updateAirThreatRadius(Number(this.form.airThreatRadiusM)).subscribe({
      next: (data) => {
        this.form.airThreatRadiusM = data.radiusM;
        this.successMessage = 'Налаштування збережено';
        this.saving = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося зберегти налаштування';
        this.saving = false;
        this.cdr.detectChanges();
      },
    });
  }
}