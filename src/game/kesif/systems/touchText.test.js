import { describe, expect, it } from 'vitest';
import { isTouchG, touchify } from './touchText.js';
import { QUESTS } from '../sim/questsData.js';
import { getHintInfo } from '../sim/quests.js';

const KEYBOARD = /sol tık|sağ tık|tuşu|tuşuna|Shift|\bTab\b|\(E\)|\bF5\b/;

describe('touchify: klavye/fare deyimleri dokunmatik düğme adlarına çevrilir', () => {
  it('ilk görev ipucu: "sol tık" yerine Kır düğmesi', () => {
    const t = touchify('Bir ağaca yaklaş, kır düğmesini (sol tık) basılı tut. Kütükler eşya olarak düşer.');
    expect(t).toBe('Bir ağaca yaklaş, Kır düğmesine basılı tut. Kütükler eşya olarak düşer.');
  });

  it('hiçbir görev ipucu dokunmatikte klavye/fare sözcüğü taşımaz; dokunulmaz metin aynen kalır', () => {
    let changed = 0;
    QUESTS.forEach((q) => {
      const t = touchify(q.hint);
      expect(t, q.id).not.toMatch(KEYBOARD);
      if (t !== q.hint) changed++;
      expect(touchify(t), q.id).toBe(t); // idempotent
    });
    expect(changed).toBeGreaterThan(8);
    expect(touchify('Çayır, orman, çöl, tundra, bataklık... Yürüdükçe yeni biyomlar günlüğüne eklenir.')).toBe(
      'Çayır, orman, çöl, tundra, bataklık... Yürüdükçe yeni biyomlar günlüğüne eklenir.',
    );
  });

  it('bağlamsal ipuçları (açlık) da çevrilir', () => {
    const inv = { count: (k) => (k === 'item:elma' ? 2 : 0) };
    const h = getHintInfo({ quests: [] }, { hunger: 3, inventory: inv });
    expect(touchify(h.text)).not.toMatch(KEYBOARD);
  });

  it('boş/geçersiz girdi bozulmaz; isTouchG', () => {
    expect(touchify('')).toBe('');
    expect(touchify(null)).toBe(null);
    expect(isTouchG({ inputState: { touch: true } })).toBe(true);
    expect(isTouchG({ input: { isTouch: true } })).toBe(true);
    expect(isTouchG({ inputState: { touch: false } })).toBe(false);
    expect(isTouchG(null)).toBe(false);
  });
});
