import {
  artilleryUnitsToDegrees,
  deriveFirePositionSector,
} from './fire-position-sector';

describe('fire-position sector geometry', () => {
  it('builds a 39 degree sector around 120 degrees', () => {
    expect(deriveFirePositionSector(20, 3, 3.4)).toEqual({
      mainDirectionDegrees: 120,
      traverseLeftDegrees: 18,
      traverseRightDegrees: 21,
      sectorLeftDegrees: 102,
      sectorRightDegrees: 141,
    });
  });

  it('normalizes a sector crossing zero degrees', () => {
    expect(deriveFirePositionSector(1, 3, 3.5)).toMatchObject({
      mainDirectionDegrees: 6,
      sectorLeftDegrees: 348,
      sectorRightDegrees: 27,
    });
  });

  it('converts artillery units to degrees exactly once', () => {
    expect(artilleryUnitsToDegrees(20)).toBe(120);
    expect(deriveFirePositionSector(20, 0, 0).mainDirectionDegrees).toBe(120);
    expect(deriveFirePositionSector(20, 0, 0).sectorLeftDegrees).toBe(120);
  });
});
