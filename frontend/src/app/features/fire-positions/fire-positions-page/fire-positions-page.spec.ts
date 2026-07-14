import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AutoRefreshService } from '../../../core/auto-refresh.service';
import { AuthService } from '../../auth/auth.service';
import { UnitsService } from '../../units/units.service';
import { FirePosition } from '../fire-position.model';
import { FirePositionsService } from '../fire-positions.service';
import { FirePositionsPage } from './fire-positions-page';

type AssignedWeapon = NonNullable<FirePosition['assignedWeapon']>;

describe('FirePositionsPage aggregate fire readiness', () => {
  let component: FirePositionsPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FirePositionsPage],
      providers: [
        provideRouter([]),
        {
          provide: FirePositionsService,
          useValue: {
            getAll: () => of([]),
            confirmReadiness: () => of(createFirePosition()),
            setNotReady: () => of(createFirePosition()),
          },
        },
        {
          provide: UnitsService,
          useValue: {
            getAll: () => of([]),
          },
        },
        {
          provide: AuthService,
          useValue: {
            getUser: () => null,
          },
        },
        {
          provide: AutoRefreshService,
          useValue: {
            watch: () => ({ unsubscribe() {} }),
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<FirePositionsPage> =
      TestBed.createComponent(FirePositionsPage);
    component = fixture.componentInstance;
  });

  it('marks fire not ready when FP is not ready and weapon is ready', () => {
    const item = createFirePosition({
      readinessStatus: 'not_combat_ready',
      notReadyReason: 'not_prepared',
      aggregateReady: true,
      assignedWeapon: createWeapon(),
    });

    expect(component.getAggregateReadinessLabel(item)).toBe('Не готова до вогню');
    expect(component.getAggregateReasonLabels(item)).toContain('ВП не підготовлена');
  });

  it('marks fire ready when FP and weapon are ready', () => {
    const item = createFirePosition({
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      assignedWeapon: createWeapon(),
    });

    expect(component.getAggregateReadinessLabel(item)).toBe('Готова до вогню');
    expect(component.getAggregateReadinessClass(item)).toBe('ready');
  });

  it('marks fire not ready when FP is ready but weapon is absent', () => {
    const item = createFirePosition({
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      assignedWeapon: null,
    });

    expect(component.getAggregateReadinessLabel(item)).toBe('Не готова до вогню');
    expect(component.getAggregateReasonLabels(item)).toContain('СГ не призначена');
  });

  it('marks fire not ready when weapon has active maintenance', () => {
    const item = createFirePosition({
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      assignedWeapon: createWeapon({ maintenanceStatus: 'in_progress' }),
    });

    expect(component.getAggregateReadinessLabel(item)).toBe('Не готова до вогню');
    expect(component.getAggregateReasonLabels(item)).toContain('активний ремонт');
  });

  function createFirePosition(overrides: Partial<FirePosition> = {}): FirePosition {
    return {
      id: 'fp-1',
      name: 'ВП-1',
      positionType: 'fire_position',
      unitId: 'unit-1',
      unit: null,
      ammoDepotId: null,
      ammoDepot: null,
      personnelRotationDate: null,
      lat: 50,
      lng: 30,
      mgrs: null,
      canEdit: true,
      isOwnScope: true,
      publicViewOnly: false,
      hasSg: true,
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      completedVgzCount: 0,
      personnelRotationStatus: null,
      airSituationStatus: null,
      mainDirectionUnits: null,
      traverseLeftUnits: null,
      traverseRightUnits: null,
      mainDirectionDegrees: null,
      traverseLeftDegrees: null,
      traverseRightDegrees: null,
      sectorLeftDegrees: null,
      sectorRightDegrees: null,
      assignedWeapon: createWeapon(),
      incomingWeapon: null,
      incomingDeployment: null,
      ...overrides,
    };
  }

  function createWeapon(overrides: Partial<AssignedWeapon> = {}): AssignedWeapon {
    return {
      id: 'weapon-1',
      readinessStatus: 'combat_ready',
      notReadyReason: null,
      deploymentStatus: 'at_fire_position',
      currentFirePositionId: 'fp-1',
      maintenanceStatus: null,
      maintenanceRequestedStartAt: null,
      maintenancePlannedEndAt: null,
      maintenanceActualEndAt: null,
      maintenanceNote: null,
      callsign: 'Alpha',
      serialNumber: 'SN-1',
      weaponModel: null,
      unit: null,
      ...overrides,
    };
  }
});
