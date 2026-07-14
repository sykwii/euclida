import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FirePositionsService } from './fire-positions.service';

describe('FirePositionsService', () => {
  let service: FirePositionsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FirePositionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('uses explicit fire-position readiness routes', () => {
    service.confirmReadiness('fp-1').subscribe();
    expect(
      http.expectOne((req) => req.url.endsWith('/fire-positions/fp-1/readiness/confirm')).request
        .method,
    ).toBe('POST');

    service.setNotReady('fp-1', { notReadyReason: 'not_prepared' }).subscribe();
    expect(
      http.expectOne((req) => req.url.endsWith('/fire-positions/fp-1/readiness/not-ready')).request
        .method,
    ).toBe('POST');
  });
});
