import { Observable, finalize } from 'rxjs';

type SubmitHandlers<T> = {
  begin: () => void;
  success: (value: T) => void;
  fail: (error: unknown) => void;
  finish: () => void;
};

export function submitForm<T>(request: Observable<T>, handlers: SubmitHandlers<T>): void {
  handlers.begin();
  request.pipe(finalize(handlers.finish)).subscribe({
    next: handlers.success,
    error: handlers.fail,
  });
}
