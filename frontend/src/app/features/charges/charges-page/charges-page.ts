import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Charge } from '../charge.model';
import { ChargesService } from '../charges.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-charges-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './charges-page.html',
  styleUrl: './charges-page.css',
})
export class ChargesPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  items: Charge[] = [];
  loading = true;
  errorMessage = '';

  form = {
    marking: '',
    packagingType: 'картузний',
    measurementUnit: 'шт',
    chargeKind: 'unit' as 'unit' | 'modular',
    modulesPerCharge: 6,
    maxUsableModules: 6,
    moduleNote: '',
  };

  constructor(
    private readonly service: ChargesService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['reference', 'stock'], () => this.load()));
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
        this.errorMessage = 'Не вдалося завантажити заряди';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  create(): void {
    this.errorMessage = '';

    if (!this.form.marking.trim()) {
      return;
    }

    this.service.create({
      marking: this.form.marking.trim(),
      packagingType: this.form.packagingType,
      measurementUnit: this.form.measurementUnit.trim() || 'шт',
      chargeKind: this.form.chargeKind,
      modulesPerCharge: this.form.chargeKind === 'modular' ? Number(this.form.modulesPerCharge) : null,
      maxUsableModules: this.form.chargeKind === 'modular' ? Number(this.form.maxUsableModules) : null,
      moduleNote: this.form.moduleNote.trim() || null,
    }).subscribe({
      next: () => {
        this.form.marking = '';
        this.form.moduleNote = '';
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося створити заряд';
        this.cdr.detectChanges();
      },
    });
  }

  remove(id: string): void {
    this.errorMessage = '';

    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = 'Не вдалося видалити заряд';
        this.cdr.detectChanges();
      },
    });
  }
}