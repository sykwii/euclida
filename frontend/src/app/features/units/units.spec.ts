import { TestBed } from '@angular/core/testing';

import { Units } from './units';

describe('Units', () => {
  let service: Units;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Units);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
