import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AnalyticsService } from './features/analytics/analytics.service';
import { AuthService } from './features/auth/auth.service';
import { DepotsService } from './features/depots/depots.service';
import { FirePositionsService } from './features/fire-positions/fire-positions.service';
import { ServiceOrdersService } from './features/service-orders/service-orders.service';
import { WeaponSystemsService } from './features/weapon-systems/weapon-systems.service';
import { AutoRefreshService } from './core/auto-refresh.service';
import { EventFeedService } from './core/event-feed.service';
import { RealtimeService } from './core/realtime.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            getUser: () => null,
            hasRole: () => false,
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            getSummary: () => of({}),
          },
        },
        {
          provide: AutoRefreshService,
          useValue: {
            watch: () => ({ unsubscribe() {} }),
          },
        },
        {
          provide: RealtimeService,
          useValue: {
            onAnyChanged: () => ({ subscribe() {}, unsubscribe() {} }),
            onConnectionChanged: () => ({ subscribe() {}, unsubscribe() {} }),
          },
        },
        {
          provide: FirePositionsService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: ServiceOrdersService,
          useValue: {
            getAll: () => of([]),
            countActionable: () => of(0),
          },
        },
        {
          provide: WeaponSystemsService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: DepotsService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: EventFeedService,
          useValue: {
            add: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
