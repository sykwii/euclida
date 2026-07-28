export interface FirePositionSectorGeometry {
  mainDirectionDegrees: number | null;
  traverseLeftDegrees: number | null;
  traverseRightDegrees: number | null;
  sectorLeftDegrees: number | null;
  sectorRightDegrees: number | null;
}

export function artilleryUnitsToDegrees(
  units: number | string | null | undefined,
): number | null {
  if (units === null || units === undefined) {
    return null;
  }

  const value = Number(units);
  return Number.isFinite(value) ? Math.ceil(value * 6) : null;
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function deriveFirePositionSector(
  mainDirectionUnits: number | string | null | undefined,
  traverseLeftUnits: number | string | null | undefined,
  traverseRightUnits: number | string | null | undefined,
): FirePositionSectorGeometry {
  const mainDirectionDegrees = artilleryUnitsToDegrees(mainDirectionUnits);
  const traverseLeftDegrees = artilleryUnitsToDegrees(traverseLeftUnits);
  const traverseRightDegrees = artilleryUnitsToDegrees(traverseRightUnits);

  return {
    mainDirectionDegrees,
    traverseLeftDegrees,
    traverseRightDegrees,
    sectorLeftDegrees:
      mainDirectionDegrees !== null && traverseLeftDegrees !== null
        ? normalizeDegrees(mainDirectionDegrees - traverseLeftDegrees)
        : null,
    sectorRightDegrees:
      mainDirectionDegrees !== null && traverseRightDegrees !== null
        ? normalizeDegrees(mainDirectionDegrees + traverseRightDegrees)
        : null,
  };
}
