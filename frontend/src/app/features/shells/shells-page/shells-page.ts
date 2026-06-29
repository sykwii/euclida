import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Shell } from '../shell.model';
import { ShellsService } from '../shells.service';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-shells-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shells-page.html',
  styleUrl: './shells-page.css',
})
export class ShellsPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  saving = false;
  deletingId = '';
  items: Shell[] = [];
  loading = true;
  errorMessage = '';

  form = {
    systemType: 'barrel',
    damageType: '',
    marking: '',
  };

  constructor(
    private readonly service: ShellsService,
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
    this.loading = true;
    this.errorMessage = '';
    this.loadSubscription?.unsubscribe();

    this.loadSubscription = this.service.getAll().subscribe({
      next: (data) => {
        this.items = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити снаряди';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  create(): void {
    if (this.saving || !this.form.marking.trim() || !this.form.damageType.trim()) {
      return;
    }

    this.saving = true;
    this.errorMessage = '';

    this.service.create({
      systemType: this.form.systemType,
      damageType: this.form.damageType.trim(),
      marking: this.form.marking.trim(),
    }).subscribe({
      next: () => {
        this.form.damageType = '';
        this.form.marking = '';
        this.saving = false;
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося створити снаряд';
        this.saving = false;
        this.cdr.detectChanges();
      },
    });
  }

  remove(id: string): void {
    if (this.deletingId) {
      return;
    }

    this.deletingId = id;
    this.errorMessage = '';

    this.service.delete(id).subscribe({
      next: () => {
        this.deletingId = '';
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося видалити снаряд';
        this.deletingId = '';
        this.cdr.detectChanges();
      },
    });
  }
}