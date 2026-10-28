/*
 * PROTOCOL: ZERO arayüz yardımcıları (bileşen değil): yerel depolama, lobi→oyun geçiş durumu,
 * etiketler ve biçimlendirme. Oyun kuralları src/game/protocolZero/*.
 */
import { DIFFICULTIES, DIFFICULTY_KEYS, LOBBY_PATH, PLAY_PATH } from '../../../game/protocolZero/constants';
import { ARCHETYPE_KEYS, DEFAULT_ARCHETYPE } from '../../../game/protocolZero/archetypes';
import { sanitizeGenes } from '../../../game/protocolZero/progression';

export { LOBBY_PATH, PLAY_PATH };

/** WebGL var mı? (globe.js'teki ile aynı; three paketi lobiye/hub kartına girmesin diye burada kopya.) */
export function detectWebGL() {
    try {
        const c = document.createElement('canvas');
        return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
        return false;
    }
}

export const STORAGE_KEYS = Object.freeze({
    muted: 'hs_pz_muted',
    name: 'hs_pz_name',
    best: 'hs_pz_best',
    difficulty: 'hs_pz_difficulty',
    archetype: 'hs_pz_archetype',
    xp: 'hs_pz_xp',
    genes: 'hs_pz_genes',
    briefed: 'hs_pz_briefed',
});

export function storageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function storageSet(key, value) {
    try {
        if (value == null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, String(value));
    } catch {
        // gizli pencere / dolu depo: sessizce geç
    }
}

export const loadMuted = () => storageGet(STORAGE_KEYS.muted) === '1';
export const saveMuted = (m) => storageSet(STORAGE_KEYS.muted, m ? '1' : '0');

export const loadName = () => storageGet(STORAGE_KEYS.name) || '';
export const saveName = (n) => storageSet(STORAGE_KEYS.name, n ? String(n).slice(0, 24) : null);

export function loadDifficulty() {
    const d = storageGet(STORAGE_KEYS.difficulty);
    return DIFFICULTY_KEYS.includes(d) ? d : 'normal';
}
export const saveDifficulty = (d) => storageSet(STORAGE_KEYS.difficulty, d);

export function loadArchetype() {
    const a = storageGet(STORAGE_KEYS.archetype);
    return ARCHETYPE_KEYS.includes(a) ? a : DEFAULT_ARCHETYPE;
}
export const saveArchetype = (a) => storageSet(STORAGE_KEYS.archetype, a);

/** Bu cihazda biriken XP (misafir). Üye için sunucu değeriyle en yükseği alınır. */
export const loadLocalXp = () => Math.max(0, Math.floor(Number(storageGet(STORAGE_KEYS.xp)) || 0));
export function addLocalXp(delta) {
    const next = loadLocalXp() + Math.max(0, Math.floor(Number(delta) || 0));
    storageSet(STORAGE_KEYS.xp, String(next));
    return next;
}
/** Üye: sunucu XP'si yerel birikimden büyükse yerel de ona çekilir (cihaz değişince gerilemesin). */
export function syncXp(serverXp) {
    const local = loadLocalXp();
    const srv = Math.max(0, Math.floor(Number(serverXp) || 0));
    if (srv > local) storageSet(STORAGE_KEYS.xp, String(srv));
    return Math.max(local, srv);
}

export function loadGenes() {
    try {
        const raw = storageGet(STORAGE_KEYS.genes);
        return sanitizeGenes(raw ? JSON.parse(raw) : []);
    } catch {
        return [];
    }
}
export const saveGenes = (keys) => storageSet(STORAGE_KEYS.genes, JSON.stringify(sanitizeGenes(keys)));

/** Bu cihazdaki en iyi sonuç (misafir ya da üye fark etmez; yalnızca gösterim). */
export function loadBest() {
    try {
        const raw = storageGet(STORAGE_KEYS.best);
        const b = raw ? JSON.parse(raw) : null;
        if (!b || typeof b !== 'object') return null;
        return { score: Number(b.score) || 0, days: Number(b.days) || 0, difficulty: b.difficulty || 'normal', outcome: b.outcome || 'defeat' };
    } catch {
        return null;
    }
}

export function saveBestIfBetter(result) {
    const cur = loadBest();
    if (!cur || Number(result.score) > cur.score) {
        storageSet(STORAGE_KEYS.best, JSON.stringify({ score: result.score, days: result.days, difficulty: result.difficulty, outcome: result.outcome }));
        return true;
    }
    return false;
}

/** Lobi → oyun geçiş durumu. */
export function buildEntry({ difficulty = 'normal', seed = Date.now(), archetype = DEFAULT_ARCHETYPE, genes = [] } = {}) {
    return {
        v: 1,
        difficulty: DIFFICULTY_KEYS.includes(difficulty) ? difficulty : 'normal',
        archetype: ARCHETYPE_KEYS.includes(archetype) ? archetype : DEFAULT_ARCHETYPE,
        genes: sanitizeGenes(genes),
        seed: Number(seed) >>> 0 || 1,
    };
}

export function readEntry(state) {
    const e = state?.entry;
    if (!e || e.v !== 1 || state?.consumed) return null;
    return buildEntry(e);
}

export const difficultyName = (key) => DIFFICULTIES[key]?.name || 'Normal';

export const STATUS_LABEL = Object.freeze({
    safe: 'Güvenli',
    warn: 'Sızma var',
    lost: 'Ele geçirildi',
    isolated: 'İzole',
});

export const fmtNum = (n) => Number(n || 0).toLocaleString('tr-TR');

export const fmtPct = (n) => `%${Math.round(Number(n) || 0)}`;

/** Oyun takvimi: başlangıç tarihi + (gün − 1). "28 Eki 2026" biçiminde. */
export function formatGameDate(startDate, day) {
    const d = new Date(startDate instanceof Date ? startDate.getTime() : Number(startDate) || Date.now());
    d.setDate(d.getDate() + Math.max(0, (Number(day) || 1) - 1));
    try {
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
        return d.toDateString();
    }
}

export function fmtSeconds(s) {
    const v = Math.max(0, Math.ceil(Number(s) || 0));
    return v >= 60 ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : `${v}`;
}

/** Zayıf cihaz tahmini: dokunmatik ya da az çekirdek → daha az parçacık, antialias kapalı. */
export function detectLowPower() {
    try {
        const nav = navigator;
        return Boolean(nav.maxTouchPoints > 0 || (nav.hardwareConcurrency && nav.hardwareConcurrency <= 4) || (nav.deviceMemory && nav.deviceMemory <= 4));
    } catch {
        return false;
    }
}

export function defeatText(reason) {
    return reason === 'panic'
        ? 'Küresel panik %100\'e ulaştı: hükümetler komutayı elinden aldı.'
        : 'Yapay zekâ tüm veri merkezlerini ele geçirdi.';
}

export function victoryText(type) {
    return type === 'purge'
        ? 'Tam temizlik: yapay zekâ ağdan tamamen silindi.'
        : 'Çekirdek şifresi çözüldü: yapay zekânın kaynak kodu imha edildi.';
}
