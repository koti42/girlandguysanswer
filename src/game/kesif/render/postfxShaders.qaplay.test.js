import { describe, it, expect } from 'vitest';
import { DOWN_FRAGMENT } from './postfxShaders.js';

describe('postfxShaders (qaplay)', () => {
  it('DOWN_FRAGMENT tap() tek dönüş noktalı (D3D11/ANGLE "f_tap uninitialized" uyarısı yok)', () => {
    const i = DOWN_FRAGMENT.indexOf('vec3 tap(vec2 uv)');
    expect(i).toBeGreaterThan(0);
    const body = DOWN_FRAGMENT.slice(i, DOWN_FRAGMENT.indexOf('void main()', i));
    expect((body.match(/\breturn\b/g) || []).length).toBe(1);
    // NaN koruması korunmuş olmalı
    expect(body).toContain('validHdr');
    expect(body).toContain('prefilter');
  });
});
