import { TestBed } from '@angular/core/testing';

import { WeaponSystems } from './weapon-systems';

describe('WeaponSystems', () => {
  let service: WeaponSystems;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WeaponSystems);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
