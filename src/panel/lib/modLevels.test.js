import { describe, expect, it } from 'vitest';
import { ADMIN_LEVEL, canDo, capabilitiesOf, levelOf, limitFor } from './modLevels';

const mod = (level) => ({ id: 'm', roles: [{ slug: 'moderator' }], mod_level: level });

describe('levelOf', () => {
    it('admin sınırsız, moderatör seviyesi, diğerleri 0', () => {
        expect(levelOf({ roles: ['admin'] })).toBe(ADMIN_LEVEL);
        expect(levelOf(mod(3))).toBe(3);
        expect(levelOf(mod(null))).toBe(1);
        expect(levelOf(mod(9))).toBe(5);
        expect(levelOf({ roles: ['user'] })).toBe(0);
        expect(levelOf(null)).toBe(0);
    });
});

describe('limitFor / canDo', () => {
    it('seviye 1 gizlemeyi 24 saatle sınırlar, ban yok', () => {
        expect(limitFor(mod(1), 'hide')).toBe(1440);
        expect(limitFor(mod(1), 'ban')).toBe(false);
        expect(canDo(mod(1), 'hide', 60)).toBe(true);
        expect(canDo(mod(1), 'hide', 3 * 1440)).toBe(false);
        expect(canDo(mod(1), 'hide', null)).toBe(false);
        expect(canDo(mod(1), 'hide')).toBe(true); // yalnızca yetenek sorgusu
        expect(canDo(mod(1), 'ban')).toBe(false);
    });
    it('seviye 4 ban 30 gün, seviye 5 süresiz, admin her şey', () => {
        expect(canDo(mod(4), 'ban', 30 * 1440)).toBe(true);
        expect(canDo(mod(4), 'ban', null)).toBe(false);
        expect(canDo(mod(5), 'ban', null)).toBe(true);
        expect(canDo({ roles: ['super_admin'] }, 'bulk')).toBe(true);
        expect(capabilitiesOf(mod(2))).toContain('remove');
        expect(capabilitiesOf(mod(2))).not.toContain('restore');
    });
});
