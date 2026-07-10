export type UserRole = 'admin' | 'operator' | 'observer';

export type UserScope = 'main' | 'division' | 'battery' | 'ew';

export interface AuthUser {
  sub: string;
  login: string;
  role: UserRole;
  scope: UserScope;
  fullName: string | null;
  unitId: string | null;
  iat?: number;
  exp?: number;
}
