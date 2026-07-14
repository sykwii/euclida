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
});
