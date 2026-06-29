import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AirThreat } from '../air-threat.model';
import { AirThreatsService } from '../air-threats.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-air-threats-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './air-threats-page.html',
  styleUrl: './air-threats-page.css',
})
export class AirThreatsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  items: AirThreat[] = [];
  loading = true;
  errorMessage = '';
  pageSkeleton = Array.from({ length: 4 });

  form = {
    threatType: '',
    lat: '',
    lng: '',
  };

  constructor(
    private readonly service: AirThreatsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['threats', 'map'], () => this.load()));
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.service.getAll().subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити мітки загроз'),
    });
  }

  create(): void {
    this.errorMessage = '';

    if (!this.form.threatType.trim() || !this.form.lat || !this.form.lng) {
      this.errorMessage = 'Вкажіть тип і координати';
      return;
    }

    this.service.create({
      threatType: this.form.threatType.trim(),
      lat: Number(this.form.lat),
      lng: Number(this.form.lng),
    }).subscribe({
      next: () => {
        this.form = {
          threatType: '',
          lat: '',
          lng: '',
        };
        this.load();
      },
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося створити мітку загрози'),
    });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: (error) => this.fail(error, error?.error?.message || 'Не вдалося видалити мітку загрози'),
    });
  }

  private fail(error: unknown, message: string): void {
        this.errorMessage = message;
    this.loading = false;
    this.cdr.detectChanges();
  }
}