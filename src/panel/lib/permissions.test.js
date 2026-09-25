import { describe, expect, it } from 'vitest';
import { can, panelsFor, rankOf } from './permissions';

const u = (...roles) => ({ id: roles.join('-') || 'u', roles: roles.map((slug) => ({ slug })) });

describe('rankOf', () => {
    it('en yüksek rol sayılır', () => {
        expect(rankOf(u('user'))).toBe(0);
        expect(rankOf(u('user', 'moderator'))).toBe(1);
        expect(rankOf(u('admin', 'moderator'))).toBe(2);
        expect(rankOf(u('super_admin'))).toBe(3);
        expect(rankOf(null)).toBe(0);
    });
    it('string rol dizisini de kabul eder', () => {
        expect(rankOf({ roles: ['admin'] })).toBe(2);
    });
});

describe('panelsFor', () => {
    it('moderatör yalnızca mod, admin ikisi', () => {
        expect(panelsFor(u('moderator'))).toEqual(['mod']);
        expect(panelsFor(u('admin'))).toEqual(['mod', 'admin']);
        expect(panelsFor(u('user'))).toEqual([]);
    });
});

describe('can.sanction', () => {
    const mod = { ...u('moderator'), id: 'm' };
    const admin = { ...u('admin'), id: 'a' };
    const superAdmin = { ...u('super_admin'), id: 's' };
    const user = { ...u('user'), id: 'x' };

    it('kendine hayır', () => {
        expect(can.sanction(mod, mod)).toBe(false);
    });
    it('moderatör kullanıcıya evet, admine hayır', () => {
        expect(can.sanction(mod, user)).toBe(true);
        expect(can.sanction(mod, admin)).toBe(false);
    });
    it('admin admine evet, süper admine hayır', () => {
        expect(can.sanction(admin, { ...u('admin'), id: 'a2' })).toBe(true);
        expect(can.sanction(admin, superAdmin)).toBe(false);
    });
    it('süper admin herkese', () => {
        expect(can.sanction(superAdmin, admin)).toBe(true);
    });
});
