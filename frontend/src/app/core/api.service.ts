import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { API_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly baseUrl = API_URL;
  private readonly tokenKey = 'euclida_access_token';

  constructor(
    private readonly http: HttpClient,
    @Inject(PLATFORM_ID) private readonly platformId: object,
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
    return this.http.get<T>(`${this.baseUrl}${url}`, {
      headers: this.getHeaders(),
    });
  }

  post<T>(url: string, body: unknown) {
    return this.http.post<T>(`${this.baseUrl}${url}`, body, {
      headers: this.getHeaders(),
    });
  }

  patch<T>(url: string, body: unknown) {
    return this.http.patch<T>(`${this.baseUrl}${url}`, body, {
      headers: this.getHeaders(),
    });
  }

  delete<T>(url: string) {
    return this.http.delete<T>(`${this.baseUrl}${url}`, {
      headers: this.getHeaders(),
    });
  }
}