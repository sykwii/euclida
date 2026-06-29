import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeaponSystemsPage } from './weapon-systems-page';

describe('WeaponSystemsPage', () => {
  let component: WeaponSystemsPage;
  let fixture: ComponentFixture<WeaponSystemsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WeaponSystemsPage],
    }).compileComponents();

    fixture = TestBed.createComponent(WeaponSystemsPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
