import { Observable, of, throwError } from 'rxjs';
import { LoginPage } from './login-page';

function createPage(loginResult: Observable<unknown>) {
  const cdr = { detectChanges: vi.fn() };
  const router = { navigateByUrl: vi.fn() };
  const page = new LoginPage(
    { login: vi.fn(() => loginResult) } as never,
    { snapshot: { queryParamMap: { get: vi.fn(() => null) } } } as never,
    router as never,
    cdr as never,
  );

  return { page, router, cdr };
}

describe('LoginPage', () => {
  it('renders a generic error and clears loading after rejected credentials', () => {
    const { page, cdr } = createPage(throwError(() => new Error('unauthorized')));
    page.login = 'operator';
    page.password = 'wrong-password';

    page.submit();

    expect(page.loading).toBe(false);
    expect(page.error).toBe('Невірний логін або пароль. Перевірте введені дані.');
    expect(page.error).not.toContain(page.login);
    expect(page.error).not.toContain(page.password);
    expect(cdr.detectChanges).toHaveBeenCalledOnce();
  });

  it('clears loading and navigates after successful login', () => {
    const { page, router, cdr } = createPage(of({}));
    page.login = 'operator';
    page.password = 'valid-password';

    page.submit();

    expect(page.loading).toBe(false);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/map');
    expect(cdr.detectChanges).toHaveBeenCalledOnce();
  });
});
