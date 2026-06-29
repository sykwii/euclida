import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
    private readonly router: Router,
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
        void this.router.navigate(['/map']);
      },
      error: () => {
        this.loading = false;
        this.error = 'Невірний логін або пароль. Перевірте введені дані.';
      },
    });
  }
}