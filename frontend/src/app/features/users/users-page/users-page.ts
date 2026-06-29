import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { ToastService } from '../../../core/toast.service';
import { Unit } from '../../units/unit.model';
import { UnitsService } from '../../units/units.service';
import {
  ManagedUser,
  UserRole,
  UserScope,
  UsersService,
} from '../users.service';

interface UserForm {
  login: string;
  password: string;
  fullName: string;
  role: UserRole;
  scope: UserScope;
  unitId: string;
  isActive: boolean;
}

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './users-page.html',
  styleUrl: './users-page.css',
})
export class UsersPage implements OnInit, OnDestroy {
  private readonly autoRefreshSubscription = new Subscription();
  items: ManagedUser[] = [];
  units: Unit[] = [];

  loading = false;
  errorMessage = '';

  modalOpen = false;
  modalSubmitting = false;
  editingUser: ManagedUser | null = null;

  form: UserForm = this.getEmptyForm();

  constructor(
    private readonly usersService: UsersService,
    private readonly unitsService: UnitsService,
    private readonly toast: ToastService,
    private readonly autoRefresh: AutoRefreshService,
  ) {}

  ngOnInit(): void {
    this.load();
    this.autoRefreshSubscription.add(this.autoRefresh.watch(['users'], () => this.load()));
    this.loadUnits();
  }

  ngOnDestroy(): void {
    this.autoRefreshSubscription.unsubscribe();
  }

  load(): void {
    this.loading = true;
    this.errorMessage = '';

    this.usersService.getAll().subscribe({
      next: (items) => {
        this.items = items;
        this.loading = false;
      },
      error: (error) => this.fail(error, 'Не вдалося завантажити користувачів'),
    });
  }

  loadUnits(): void {
    this.unitsService.getAll().subscribe({
      next: (items) => {
        this.units = items;
      },
      error: () => undefined,
    });
  }

  openCreate(): void {
    this.editingUser = null;
    this.form = this.getEmptyForm();
    this.errorMessage = '';
    this.modalSubmitting = false;
    this.modalOpen = true;
  }

  openEdit(user: ManagedUser): void {
    this.editingUser = user;

    this.form = {
      login: user.login,
      password: '',
      fullName: user.fullName || '',
      role: user.role,
      scope: user.scope,
      unitId: user.unitId || '',
      isActive: user.isActive,
    };

    this.errorMessage = '';
    this.modalSubmitting = false;
    this.modalOpen = true;
  }

  closeModal(): void {
    if (this.modalSubmitting) {
      return;
    }

    this.modalOpen = false;
    this.editingUser = null;
  }

  onModalBackdropClick(): void {
    this.closeModal();
  }

  onModalCardClick(event: MouseEvent): void {
    event.stopPropagation();
  }

 save(): void {
  if (this.modalSubmitting) {
    return;
  }

  this.errorMessage = '';

  if (!this.form.login.trim()) {
    this.errorMessage = 'Вкажіть логін';
    return;
  }

  if (!this.editingUser && this.form.password.trim().length < 6) {
    this.errorMessage = 'Пароль має бути мінімум 6 символів';
    return;
  }

  if (this.form.scope !== 'main' && !this.form.unitId) {
    this.errorMessage = 'Для рівня дивізіон/батарея потрібно обрати підрозділ';
    return;
  }

  const unitId = this.form.scope === 'main'
    ? null
    : this.normalizeUuid(this.form.unitId);

  if (this.form.scope !== 'main' && !unitId) {
    this.errorMessage = 'Выберите корректное подразделение';
    return;
  }

  const body = {
    login: this.form.login.trim(),
    fullName: this.form.fullName.trim() || null,
    role: this.form.role,
    scope: this.form.scope,
    unitId,
    isActive: this.form.isActive,
    ...(this.form.password.trim()
      ? {
          password: this.form.password.trim(),
        }
      : {}),
  };

  this.modalSubmitting = true;

  if (this.editingUser) {
    this.usersService.update(this.editingUser.id, body).subscribe({
      next: () => {
        this.modalSubmitting = false;
        this.toast.show('Користувача оновлено', 'success');
        this.closeModal();
        this.load();
      },
      error: (error) => {
        this.modalSubmitting = false;
        this.fail(error, 'Не вдалося оновити користувача');
      },
    });

    return;
  }

  this.usersService.create({
    ...body,
    password: this.form.password.trim(),
  }).subscribe({
    next: () => {
      this.modalSubmitting = false;
      this.toast.show('Користувача створено', 'success');
      this.closeModal();
      this.load();
    },
    error: (error) => {
      this.modalSubmitting = false;
      this.fail(error, 'Не вдалося створити користувача');
    },
  });
}

  remove(user: ManagedUser): void {
    if (!confirm(`Видалити користувача ${user.login}?`)) {
      return;
    }

    this.usersService.delete(user.id).subscribe({
      next: () => {
        this.toast.show('Користувача видалено', 'warning');
        this.load();
      },
      error: (error) => this.fail(error, 'Не вдалося видалити користувача'),
    });
  }

  toggleActive(user: ManagedUser): void {
    this.usersService.update(user.id, {
      isActive: !user.isActive,
    }).subscribe({
      next: () => {
        this.toast.show(
          user.isActive ? 'Користувача деактивовано' : 'Користувача активовано',
          'success',
        );
        this.load();
      },
      error: (error) => this.fail(error, 'Не вдалося змінити статус'),
    });
  }

onScopeChange(): void {
  this.form.unitId = '';
}

  getRoleLabel(role: string): string {
    if (role === 'admin') return 'Адміністратор';
    if (role === 'operator') return 'Оператор';
    if (role === 'observer') return 'Спостерігач';

    return role;
  }

  getScopeLabel(scope: string): string {
    if (scope === 'main') return 'Головний пункт';
    if (scope === 'division') return 'Дивізіон';
    if (scope === 'battery') return 'Батарея';

    return scope;
  }

  private getEmptyForm(): UserForm {
    return {
      login: '',
      password: '',
      fullName: '',
      role: 'operator',
      scope: 'battery',
      unitId: '',
      isActive: true,
    };
  }

  private fail(error: unknown, message: string): void {
        this.errorMessage =
      (error as { error?: { message?: string } })?.error?.message || message;
    this.toast.show(this.errorMessage, 'danger');
    this.loading = false;
  }

get availableUnits(): Unit[] {
  if (this.form.scope === 'main') {
    return [];
  }

  if (this.form.scope === 'division') {
    return this.units
      .filter((unit) => this.isUuid(unit.id))
      .filter((unit) => !this.isExplicitBatteryUnit(unit));
  }

  if (this.form.scope === 'battery') {
    return this.units
      .filter((unit) => this.isUuid(unit.id))
      .filter((unit) => this.isBatteryUnit(unit));
  }

  return [];
}

private isDivisionUnit(unit: Unit): boolean {
  const type = unit.type.toLowerCase();
  const hasChildren = this.units.some((candidate) => candidate.parentId === unit.id);

  return (
    hasChildren ||
    ['division', 'dnar', 'divizion'].includes(type) ||
    type.includes('див') ||
    type.includes('дн')
  );
}

private isBatteryUnit(unit: Unit): boolean {
  const type = unit.type.toLowerCase();
  const hasChildren = this.units.some((candidate) => candidate.parentId === unit.id);

  return (
    !hasChildren &&
    (unit.parentId !== null ||
      type === 'battery' ||
      type.includes('battery') ||
      type.includes('бат'))
  );
}

private isExplicitBatteryUnit(unit: Unit): boolean {
  const type = unit.type.toLowerCase();
  return type === 'battery' || type.includes('battery') || type.includes('Р±Р°С‚');
}

private normalizeUuid(value: string): string | null {
  const trimmed = value.trim();
  return this.isUuid(trimmed) ? trimmed : null;
}

private isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

}
