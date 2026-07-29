export type LeafletModule = typeof import('leaflet');

export function resolveLeafletModule(moduleValue: unknown): LeafletModule {
  let candidate = moduleValue;
  const visited = new Set<unknown>();

  while (candidate && !visited.has(candidate)) {
    if (
      typeof (candidate as Partial<LeafletModule>).map === 'function' &&
      typeof (candidate as Partial<LeafletModule>).layerGroup === 'function'
    ) {
      return candidate as LeafletModule;
    }
    visited.add(candidate);
    candidate = (candidate as { default?: unknown }).default;
  }

  throw new Error('Leaflet module did not expose the expected browser API');
}
