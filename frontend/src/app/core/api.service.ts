import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { Observable, catchError, map, throwError } from 'rxjs';
import { API_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = API_URL;
  private readonly tokenKey = 'euclida_access_token';
  private readonly userKey = 'euclida_user';

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
    private readonly router: Router,
  ) {}

  private getHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });

    if (isPlatformBrowser(this.platformId)) {
      const token = localStorage.getItem(this.tokenKey);

      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
      }
    }

    return headers;
  }

get<T>(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  const noCacheUrl = `${url}${separator}_ts=${Date.now()}`;

  return this.http
    .get<T>(`${this.baseUrl}${noCacheUrl}`, {
      headers: this.getHeaders(),
    })
    .pipe(
      map((response) => this.unwrapCollection<T>(response)),
      catchError((error): Observable<T> => this.handleError<T>(url, error)),
    );
}

  post<T>(url: string, body: unknown) {
    return this.http
      .post<T>(`${this.baseUrl}${url}`, body, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((response) => this.unwrapCollection<T>(response)),
        catchError((error): Observable<T> => this.handleError<T>(url, error)),
      );
  }

  patch<T>(url: string, body: unknown) {
    return this.http
      .patch<T>(`${this.baseUrl}${url}`, body, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((response) => this.unwrapCollection<T>(response)),
        catchError((error): Observable<T> => this.handleError<T>(url, error)),
      );
  }

  delete<T>(url: string) {
    return this.http
      .delete<T>(`${this.baseUrl}${url}`, {
        headers: this.getHeaders(),
      })
      .pipe(
        map((response) => this.unwrapCollection<T>(response)),
        catchError((error): Observable<T> => this.handleError<T>(url, error)),
      );
  }

  private unwrapCollection<T>(response: T): T {
    if (response && typeof response === 'object') {
      const value = (response as { value?: unknown }).value;

      if (Array.isArray(value)) {
        return value as T;
      }
    }

    return response;
  }

  private handleError<T>(url: string, error: unknown): Observable<T> {
    const status = (error as { status?: number })?.status;

    if (status === 401 && url !== '/auth/login' && isPlatformBrowser(this.platformId)) {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);

      if (window.location.pathname === '/login') {
        return throwError(() => error);
      }

      const returnUrl = `${window.location.pathname}${window.location.search}`;

      void this.router.navigate(['/login'], {
        queryParams: returnUrl && returnUrl !== '/login' ? { returnUrl } : undefined,
      });
    }

    return throwError(() => error);
  }
}
