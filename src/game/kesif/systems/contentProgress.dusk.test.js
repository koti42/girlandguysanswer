import { describe, expect, it } from 'vitest';
import { createClock, setClockPhase } from '../sim/daynight.js';
import { isDuskHint } from './contentProgress.js';

function clockAt(phase, day) {
  const c = createClock({ day: day || 0 });
  setClockPhase(c, phase);
  return c;
}

describe('isDuskHint (ilk akşam ipucu penceresi)', () => {
  it('gün batımı başında ilk dakika açık; öncesi ve sonrası kapalı', () => {
    expect(isDuskHint(clockAt(0.3, 0))).toBe(false);
    expect(isDuskHint(clockAt(0.439, 0))).toBe(false);
    expect(isDuskHint(clockAt(0.4405, 0))).toBe(true);
    expect(isDuskHint(clockAt(0.47, 0))).toBe(true); // 36 sn sonra
    expect(isDuskHint(clockAt(0.495, 0))).toBe(false); // 66 sn sonra
    expect(isDuskHint(clockAt(0.75, 0))).toBe(false);
  });

  it('yalnızca ilk iki gün (0 ve 1)', () => {
    expect(isDuskHint(clockAt(0.45, 0))).toBe(true);
    expect(isDuskHint(clockAt(0.45, 1))).toBe(true);
    expect(isDuskHint(clockAt(0.45, 2))).toBe(false);
    expect(isDuskHint(null)).toBe(false);
  });
});
