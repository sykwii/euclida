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
    const item = createWeapon({ maintenanceStatus: 'opened' });

    expect(component.canOpenMaintenance(item)).toBe(false);
    expect(component.canStartMaintenance(item)).toBe(true);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(true);
  });

  it('shows only completion actions for in-progress maintenance', () => {
    const item = createWeapon({ maintenanceStatus: 'in_progress' });

    expect(component.canOpenMaintenance(item)).toBe(false);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(true);
    expect(component.canCancelMaintenance(item)).toBe(true);
  });

  it('shows readiness confirmation but no repair actions after completed maintenance', () => {
    const item = createWeapon({
      readinessStatus: 'not_combat_ready',
      maintenanceStatus: 'completed',
    });

    expect(component.getReadinessLabel(item.readinessStatus)).toBe('НЕ БГ');
    expect(component.canOpenMaintenance(item)).toBe(false);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(false);
  });

  it('allows opening new maintenance after cancelled maintenance', () => {
    const item = createWeapon({ maintenanceStatus: 'cancelled' });

    expect(component.canOpenMaintenance(item)).toBe(true);
    expect(component.canStartMaintenance(item)).toBe(false);
    expect(component.canCompleteMaintenance(item)).toBe(false);
    expect(component.canCancelMaintenance(item)).toBe(false);
  });
});

function createWeapon(overrides: Partial<Parameters<WeaponSystemsPage['canOpenMaintenance']>[0]> = {}) {
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
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
    locationType: 'reserve',
    firePositionId: null,
    maintenances: [],
    deployments: [],
    ...overrides,
  };
}
