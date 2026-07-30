import { throwError } from 'rxjs';
import { ApiService } from './api.service';

function createService() {
  const http = {
    get: vi.fn(() => throwError(() => ({ status: 401 }))),
  };
  const router = { navigate: vi.fn() };
  const service = new ApiService(http as never, 'browser' as never, router as never);
  return { service, router };
}

describe('ApiService authentication failure handling', () => {
  afterEach(() => {
    localStorage.clear();
    history.replaceState({}, '', '/');
  });

  it('does not recursively navigate when a background request fails on login', () => {
    const { service, router } = createService();
    history.replaceState({}, '', '/login');
    localStorage.setItem('euclida_access_token', 'expired');
    localStorage.setItem('euclida_user', '{}');

    service.get('/operational-notifications').subscribe({ error: () => undefined });

    expect(localStorage.getItem('euclida_access_token')).toBeNull();
    expect(localStorage.getItem('euclida_user')).toBeNull();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('returns a protected route to login once', () => {
    const { service, router } = createService();
    history.replaceState({}, '', '/service-orders?tab=active');

    service.get('/service-orders').subscribe({ error: () => undefined });

    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/service-orders?tab=active' },
    });
  });
});
