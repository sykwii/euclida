import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPage {
  login = '';
  password = '';
  loading = false;
  error = '';

  constructor(
    private readonly auth: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  submit(): void {
    this.error = '';

    if (!this.login.trim() || !this.password.trim()) {
      this.error = 'Вкажіть логін і пароль';
      return;
    }

    this.loading = true;

    this.auth.login(this.login.trim(), this.password).subscribe({
      next: () => {
        this.loading = false;
        this.cdr.detectChanges();
        void this.router.navigateByUrl(this.getReturnUrl());
      },
      error: () => {
        this.loading = false;
        this.error = 'Невірний логін або пароль. Перевірте введені дані.';
        this.cdr.detectChanges();
      },
    });
  }

  private getReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');

    if (!returnUrl || !returnUrl.startsWith('/') || returnUrl.startsWith('//')) {
      return '/map';
    }

    return returnUrl;
  }
}
