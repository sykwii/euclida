import { Injectable } from '@angular/core';
import { ApiService } from '../../core/api.service';

export type UserRole = 'admin' | 'operator' | 'observer';
export type UserScope = 'main' | 'division' | 'battery';

export interface ManagedUser {
  id: string;
  login: string;
  fullName: string | null;
  role: UserRole;
  scope: UserScope;
  unitId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  unit?: {
    id: string;
    name: string;
  } | null;
}

export interface CreateManagedUserRequest {
  login: string;
  password: string;
  fullName?: string | null;
  role: UserRole;
  scope: UserScope;
  unitId?: string | null;
  isActive?: boolean;
}

export interface UpdateManagedUserRequest {
  login?: string;
  password?: string;
  fullName?: string | null;
  role?: UserRole;
  scope?: UserScope;
  unitId?: string | null;
  isActive?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  constructor(private readonly api: ApiService) {}

  getAll() {
    return this.api.get<ManagedUser[]>('/users');
  }

  create(body: CreateManagedUserRequest) {
    return this.api.post<ManagedUser>('/users', body);
  }

  update(id: string, body: UpdateManagedUserRequest) {
    return this.api.patch<ManagedUser>(`/users/${id}`, body);
  }

  delete(id: string) {
    return this.api.delete<void>(`/users/${id}`);
  }
}