import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { ApiService } from '../../core/api.service';

export type UserRole = 'admin' | 'operator' | 'observer';
export type UserScope = 'main' | 'division' | 'battery';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    login: string;
    fullName: string | null;
    role: UserRole;
    scope: UserScope;
    unitId: string | null;
  };
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly tokenKey = 'euclida_access_token';
  private readonly userKey = 'euclida_user';

  constructor(
    private readonly api: ApiService,
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: object,
  ) {}

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  login(login: string, password: string) {
    return this.api
      .post<LoginResponse>('/auth/login', {
        login,
        password,
      })
      .pipe(
        tap((response) => {
          if (!this.isBrowser) {
            return;
          }

          localStorage.setItem(
            this.tokenKey,
            response.accessToken,
          );

          localStorage.setItem(
            this.userKey,
            JSON.stringify(response.user),
          );
        }),
      );
  }

  logout(): void {
    if (this.isBrowser) {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    }

    void this.router.navigate(['/login']);
  }

  getToken(): string | null {
    if (!this.isBrowser) {
      return null;
    }

    return localStorage.getItem(this.tokenKey);
  }

  getUser() {
    if (!this.isBrowser) {
      return null;
    }

    const raw = localStorage.getItem(this.userKey);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as LoginResponse['user'];
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  hasRole(role: string): boolean {
    return this.getUser()?.role === role;
  }
}