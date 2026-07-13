import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WeaponSystemsService } from './weapon-systems.service';

describe('WeaponSystemsService', () => {
  let service: WeaponSystemsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(WeaponSystemsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
