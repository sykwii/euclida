declare module 'mgrs' {
  export function toPoint(
    mgrs: string,
  ): [number, number];

  export function forward(
    coordinates: [number, number],
    accuracy?: number,
  ): string;
}