import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Fuze } from '../fuze.model';
import { FuzesService } from '../fuzes.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-fuzes-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './fuzes-page.html',
  styleUrl: './fuzes-page.css',
})
export class FuzesPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  submitting = false;
  items: Fuze[] = [];
  loading = true;
  errorMessage = '';

  form = {
    marking: '',
    material: '',
  };

  constructor(
    private readonly service: FuzesService,
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
        this.errorMessage = 'Не вдалося завантажити запалювачі';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  create(): void {
    if (this.submitting) {
      return;
    }

    if (!this.form.marking.trim()) {
      return;
    }

    this.submitting = true;
    this.errorMessage = '';

    this.service.create({
      marking: this.form.marking.trim(),
      material: this.form.material.trim() || undefined,
    }).subscribe({
      next: () => {
        this.form.marking = '';
        this.form.material = '';
        this.submitting = false;
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося створити запалювач';
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
        this.errorMessage = 'Не вдалося видалити запалювач';
        this.submitting = false;
        this.cdr.detectChanges();
      },
    });
  }
}