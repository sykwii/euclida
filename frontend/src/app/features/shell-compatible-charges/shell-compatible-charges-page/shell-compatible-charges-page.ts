import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Charge } from '../../charges/charge.model';
import { ChargesService } from '../../charges/charges.service';
import { Shell } from '../../shells/shell.model';
import { ShellsService } from '../../shells/shells.service';
import { ShellCompatibleCharge } from '../shell-compatible-charge.model';
import { ShellCompatibleChargesService } from '../shell-compatible-charges.service';
import { forkJoin, Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';

@Component({
  selector: 'app-shell-compatible-charges-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './shell-compatible-charges-page.html',
  styleUrl: './shell-compatible-charges-page.css',
})
export class ShellCompatibleChargesPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  private loadSubscription?: Subscription;
  items: ShellCompatibleCharge[] = [];
  shells: Shell[] = [];
  charges: Charge[] = [];
  loading = true;
  errorMessage = '';

  form = {
    shellId: '',
    chargeId: '',
    maxRangeM: 0,
  };

  constructor(
    private readonly service: ShellCompatibleChargesService,
    private readonly shellsService: ShellsService,
    private readonly chargesService: ChargesService,
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
      charges: this.chargesService.getAll(),
    }).subscribe({
      next: ({ items, shells, charges }) => {
        this.items = items;
        this.shells = shells;
        this.charges = charges;
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
    if (!this.form.shellId || !this.form.chargeId || this.form.maxRangeM <= 0) {
      return;
    }

    this.service.create({
      shellId: this.form.shellId,
      chargeId: this.form.chargeId,
      maxRangeM: Number(this.form.maxRangeM),
    }).subscribe({
      next: () => {
        this.form.shellId = '';
        this.form.chargeId = '';
        this.form.maxRangeM = 0;
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