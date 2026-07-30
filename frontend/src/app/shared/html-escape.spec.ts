import { describe, expect, it } from 'vitest';
import { escapeHtml } from './html-escape';

describe('escapeHtml', () => {
  it('neutralizes HTML and attribute payloads used by Leaflet popups', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#039;x&#039;)&quot;&gt;',
    );
  });

  it('handles nullish values without exposing literal null or undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
