import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';

import { UnitsPage } from './units-page';

@Component({
  standalone: true,
  template: '',
})
class LoginStubComponent {}

describe('UnitsPage', () => {
  let component: UnitsPage;
  let fixture: ComponentFixture<UnitsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnitsPage],
      providers: [provideRouter([{ path: 'login', component: LoginStubComponent }])],
    }).compileComponents();

    fixture = TestBed.createComponent(UnitsPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
