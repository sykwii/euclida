import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Fuze } from '../../fuzes/fuze.model';
import { FuzesService } from '../../fuzes/fuzes.service';
import { Shell } from '../../shells/shell.model';
import { ShellsService } from '../../shells/shells.service';
import { ShellCompatibleFuze } from '../shell-compatible-fuze.model';
import { ShellCompatibleFuzesService } from '../shell-compatible-fuzes.service';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-shell-compatible-fuzes-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shell-compatible-fuzes-page.html',
  styleUrl: './shell-compatible-fuzes-page.css',
})
export class ShellCompatibleFuzesPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  items: ShellCompatibleFuze[] = [];
  shells: Shell[] = [];
  fuzes: Fuze[] = [];
  loading = true;
  errorMessage = '';

  form = {
    shellId: '',
    fuzeId: '',
  };

  constructor(
    private readonly service: ShellCompatibleFuzesService,
    private readonly shellsService: ShellsService,
    private readonly fuzesService: FuzesService,
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
      items: this.service.getAll(),
      shells: this.shellsService.getAll(),
      fuzes: this.fuzesService.getAll(),
    }).subscribe({
      next: ({ items, shells, fuzes }) => {
        this.items = items;
        this.shells = shells;
        this.fuzes = fuzes;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.errorMessage = 'Не вдалося завантажити сумісність';
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  create(): void {
    if (!this.form.shellId || !this.form.fuzeId) {
      return;
    }

    this.service.create({
      shellId: this.form.shellId,
      fuzeId: this.form.fuzeId,
    }).subscribe({
      next: () => {
        this.form.shellId = '';
        this.form.fuzeId = '';
        this.load();
      },
      error: () => {
        this.errorMessage = 'Не вдалося створити сумісність';
        this.cdr.detectChanges();
      },
    });
  }

  remove(id: string): void {
    this.service.delete(id).subscribe({
      next: () => this.load(),
      error: () => {
        this.errorMessage = 'Не вдалося видалити сумісність';
        this.cdr.detectChanges();
      },
    });
  }
}