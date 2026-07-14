import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WeaponSystemsService } from './weapon-systems.service';

describe('WeaponSystemsService', () => {
  let service: WeaponSystemsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WeaponSystemsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('uses canonical maintenance routes', () => {
    service.openMaintenance('weapon-1', { reason: 'breakdown' }).subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/maintenance/open')).request.method).toBe('POST');

    service.startMaintenance('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/maintenance/start')).request.method).toBe('POST');

    service.completeMaintenance('weapon-1', { result: 'done' }).subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/maintenance/complete')).request.method).toBe('POST');

    service.cancelMaintenance('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/maintenance/cancel')).request.method).toBe('POST');

    service.confirmReadiness('weapon-1', { readinessStatus: 'combat_ready' }).subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/readiness/confirm')).request.method).toBe('POST');
  });

  it('uses canonical deployment routes', () => {
    service.planMoveToFirePosition('weapon-1', { targetFirePositionId: 'fp-1', force: true }).subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/assign')).request.method).toBe('POST');

    service.startMoveToFirePosition('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/start-to-fire-position')).request.method).toBe('POST');

    service.confirmFirePositionArrival('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/confirm-fire-position-arrival')).request.method).toBe('POST');

    service.planMoveToReserve('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/withdraw')).request.method).toBe('POST');

    service.startMoveToReserve('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/start-to-reserve')).request.method).toBe('POST');

    service.confirmReserveArrival('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/confirm-reserve-arrival')).request.method).toBe('POST');

    service.cancelDeployment('weapon-1').subscribe();
    expect(http.expectOne((req) => req.url.endsWith('/weapon-systems/weapon-1/deployment/cancel')).request.method).toBe('POST');
  });
});
