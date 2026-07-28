import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';

import { WeaponSystemsPage } from './weapon-systems-page';

@Component({
  standalone: true,
  template: '',
})
class LoginStubComponent {}

describe('WeaponSystemsPage', () => {
  let component: WeaponSystemsPage;
  let fixture: ComponentFixture<WeaponSystemsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeaponSystemsPage],
      providers: [provideRouter([{ path: 'login', component: LoginStubComponent }])],
    }).compileComponents();

    fixture = TestBed.createComponent(WeaponSystemsPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows only opened maintenance actions for opened maintenance', () => {
    const item = createWeapon({
      maintenanceStatus: 'opened',
      activeMaintenance: createMaintenance('opened'),
    });

    expect(component.canOpenMaintenance(item)).toBe(false);
    expect(component.canStartMaintenance(item)).toBe(true);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(true);
  });

  it('shows only completion actions for in-progress maintenance', () => {
    const item = createWeapon({
      maintenanceStatus: 'in_progress',
      activeMaintenance: createMaintenance('in_progress'),
    });

    expect(component.canOpenMaintenance(item)).toBe(false);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(true);
    expect(component.canCancelMaintenance(item)).toBe(true);
  });

  it('shows readiness confirmation but no repair actions after completed maintenance', () => {
    const item = createWeapon({
      readinessStatus: 'not_combat_ready',
      maintenanceStatus: 'completed',
      activeMaintenance: null,
    });

    expect(component.getReadinessLabel(item.readinessStatus)).toBe('НЕ БГ');
    expect(component.canOpenMaintenance(item)).toBe(true);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(false);
  });

  it('allows opening new maintenance after cancelled maintenance', () => {
    const item = createWeapon({
      maintenanceStatus: 'cancelled',
      activeMaintenance: null,
    });

    expect(component.canOpenMaintenance(item)).toBe(true);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(false);
  });

  it('ignores a stale active maintenance cache', () => {
    const item = createWeapon({
      maintenanceStatus: 'opened',
      activeMaintenance: null,
    });

    expect(component.canOpenMaintenance(item)).toBe(true);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(false);
  });

  it('uses the localized reserve-area fallback for an active deployment', () => {
    const item = createWeapon({
      deployments: [{
        id: 'deployment-1',
        fromLocationType: 'fire_position',
        fromLocationId: 'fp-1',
        toLocationType: 'reserve_area',
        toLocationId: null,
        status: 'moving',
        orderedAt: '2026-07-28T00:00:00.000Z',
        departedAt: '2026-07-28T00:01:00.000Z',
        arrivedAt: null,
        note: null,
      }],
    });

    expect(component.getLocationName(item)).toBe('РЗ');
  });

  it('keeps two maximum-action card models and fires an action once', () => {
    component.items = [
      createWeapon({ id: 'weapon-1', readinessStatus: 'combat_ready' }),
      createWeapon({
        id: 'weapon-2',
        callsign: 'Довгий український позивний для перевірки переносу',
        readinessStatus: 'combat_ready',
      }),
    ];
    component.loading = false;
    component.errorMessage = '';
    (
      component as unknown as {
        auth: { getUser(): { role: string; scope: string } };
      }
    ).auth.getUser = () => ({ role: 'admin', scope: 'main' });
    Object.defineProperty(component, 'visibleItems', {
      configurable: true,
      get: () => component.items,
    });
    vi.spyOn(component, 'canEditWeapon').mockReturnValue(true);
    vi.spyOn(component, 'canAssign').mockReturnValue(false);
    vi.spyOn(component, 'canWithdraw').mockReturnValue(true);
    const edit = vi.spyOn(component, 'startEdit').mockImplementation(() => undefined);

    component.startEdit(component.filteredItems[0]);

    expect(component.filteredItems.length).toBe(2);
    expect(edit).toHaveBeenCalledOnce();
  });
});

function createWeapon(
  overrides: Partial<Parameters<WeaponSystemsPage['canOpenMaintenance']>[0]> = {},
) {
  return {
    id: 'weapon-1',
    weaponModelId: 'model-1',
    serialNumber: 'SN-1',
    callsign: 'Alpha',
    unitId: 'unit-1',
    readinessStatus: 'combat_ready',
    notReadyReason: null,
    deploymentStatus: 'reserve_area',
    currentFirePositionId: null,
    maintenanceStatus: null,
    activeMaintenance: null,
    isArchived: false,
    archivedAt: null,
    archivedByUserId: null,
    hasHistoricalReferences: false,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    locationType: 'reserve',
    firePositionId: null,
    maintenances: [],
    deployments: [],
    ...overrides,
  };
}

function createMaintenance(status: 'opened' | 'in_progress') {
  return {
    id: 'maintenance-1',
    reason: 'scheduled',
    status,
    startedAt: '2026-07-14T00:00:00.000Z',
    expectedCompletedAt: null,
    completedAt: null,
    description: null,
    result: null,
  };
}
