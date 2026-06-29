import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UnitsPage } from './units-page';

describe('UnitsPage', () => {
  let component: UnitsPage;
  let fixture: ComponentFixture<UnitsPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UnitsPage],
    }).compileComponents();

    fixture = TestBed.createComponent(UnitsPage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
