/**
 * Rol -> yetenek haritası. Backend'deki role middleware'iyle aynı sınırlar;
 * burada yalnızca menü ve düğme görünürlüğü için. Asıl kapı sunucuda.
 */

const RANK = { user: 0, fenomen: 0, moderator: 1, admin: 2, super_admin: 3 };

export function rolesOf(user) {
    if (!user?.roles) return [];
    return user.roles.map((r) => (typeof r === 'string' ? r : r.slug)).filter(Boolean);
}

export function rankOf(user) {
    return Math.max(0, ...rolesOf(user).map((r) => RANK[r] ?? 0));
}

export const can = {
    moderate: (u) => rankOf(u) >= 1,
    admin: (u) => rankOf(u) >= 2,
    superAdmin: (u) => rankOf(u) >= 3,
    /** Hedef kullanıcıya yaptırım: hedef eşit/üst rütbedeyse hayır, kendine hayır. */
    sanction: (actor, target) => {
        if (!actor || !target) return false;
        if (actor.id === target.id) return false;
        const a = rankOf(actor);
        const t = rankOf(target);
        if (t >= 3) return a >= 3;      // super_admin'e yalnızca super_admin
        if (t >= 2) return a >= 2;      // admin'e moderatör dokunamaz
        return a >= 1;
    },
    grantSuperAdmin: (u) => rankOf(u) >= 3,
    system: (u) => rankOf(u) >= 3,
};

/** Menü/rota için hangi panellere girebilir. */
export function panelsFor(user) {
    const out = [];
    if (can.moderate(user)) out.push('mod');
    if (can.admin(user)) out.push('admin');
    return out;
}
