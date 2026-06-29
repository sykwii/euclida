import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WeaponModel } from '../weapon-model.model';
import { WeaponModelsService } from '../weapon-models.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-weapon-models-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './weapon-models-page.html',
  styleUrl: './weapon-models-page.css',
})
export class WeaponModelsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  submitting = false;
  items: WeaponModel[] = [];
  loading = true;
  errorMessage = '';

  form = {
    name: '',
    systemType: 'barrel',
    zonesCount: 0,
  };

  constructor(
    private readonly service: WeaponModelsService,
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

    this.loadSubscription = this.service.getAll().subscribe({
      next: (data) => {
        this.items = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити зразки';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  create(): void {
    if (this.submitting) {
      return;
    }

    if (!this.form.name.trim()) {
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.service.create({
      name: this.form.name.trim(),
      systemType: this.form.systemType,
      zonesCount: Number(this.form.zonesCount),
    }).subscribe({
      next: () => {
        this.form.name = '';
        this.form.systemType = 'barrel';
        this.form.zonesCount = 0;
        this.submitting = false;
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося створити зразок';
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
        this.errorMessage = 'Не вдалося видалити зразок';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }
}