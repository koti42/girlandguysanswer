/*
 * Kalıcı ilerleme: tecrübe puanı (XP), komutan rütbeleri ve
 * seviyeyle açılan "Protokol Genleri". Oyuncu her kategoriden EN FAZLA BİR gen kuşanır (5 yuva).
 *
 *   xpFor({ score, days, outcome, difficulty })  — sunucu (ProtocolZeroScoreService::xpFor) ile BİREBİR aynı
 *   levelFor(xp) → { level, rank, xp, current, next, percent }
 *   unlockedGenes(xp) → gen anahtarları;  geneMods(genes) → sim.cfg çarpanları
 */

export const XP_VICTORY = 300;
export const XP_DIFFICULTY = Object.freeze({ easy: 0, normal: 50, hard: 120, nightmare: 250 });

/** Bir oyunun XP'si. Sunucu formülüyle aynı tutulmalı. */
export function xpFor({ score = 0, days = 1, outcome = 'defeat', difficulty = 'normal' } = {}) {
    const s = Math.max(0, Math.floor(Number(score) || 0));
    const d = Math.max(1, Math.min(365, Math.floor(Number(days) || 1)));
    return Math.floor(s / 50) + d * 2 + (outcome === 'victory' ? XP_VICTORY : 0) + (XP_DIFFICULTY[difficulty] ?? 0);
}

/** Kümülatif seviye eşikleri (seviye 1 = 0 XP). */
export const LEVEL_XP = Object.freeze([0, 300, 800, 1500, 2400, 3500, 5000, 7000, 9500, 12500, 16000, 20000]);
export const RANKS = Object.freeze([
    'Analist', 'Operatör', 'Siber Uzman', 'Koordinatör', 'Kriz Yöneticisi', 'Komutan',
    'Kıdemli Komutan', 'Stratejist', 'Genel Koordinatör', 'Dünya Komutanı', 'Efsane', 'Tekillik Avcısı',
]);

export function levelFor(xp) {
    const v = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 1;
    for (let i = 0; i < LEVEL_XP.length; i++) if (v >= LEVEL_XP[i]) level = i + 1;
    const current = LEVEL_XP[level - 1];
    const next = LEVEL_XP[level] ?? null;
    const percent = next == null ? 100 : Math.round(((v - current) / (next - current)) * 100);
    return { level, rank: RANKS[level - 1] || RANKS[RANKS.length - 1], xp: v, current, next, percent, max: next == null };
}

/** Gen kategorileri (her birinden bir yuva). */
export const GENE_CATEGORIES = Object.freeze([
    { key: 'budget', name: 'Bütçe', icon: '💰', color: '#fde68a' },
    { key: 'defense', name: 'Savunma', icon: '🛡️', color: '#22d3ee' },
    { key: 'research', name: 'Araştırma', icon: '🧪', color: '#a78bfa' },
    { key: 'society', name: 'Toplum', icon: '🕊️', color: '#fb7185' },
    { key: 'ops', name: 'Operasyon', icon: '🛰️', color: '#34d399' },
]);

/**
 * mods alanları sim tarafından okunur:
 *  startBudget (+), firewallCost (×), income (×), startFirewall (+), isolatePanicSpike (bool: false → anlık panik yok),
 *  isolatePressure (×), purgeAmount (+), decryptBase (×), techCost (×), startDecrypt (+), panicRecovery (+/sn),
 *  dilemmaPanic (×), panicRate (×), breachSeconds (+), bubbleTtl (+), dataBudget (+), reseedEvery (×)
 */
export const GENES = Object.freeze([
    { key: 'reserve', category: 'budget', level: 1, name: 'Acil Rezerv', desc: 'Göreve +150 ₵ ile başla.', mods: { startBudget: 150 } },
    { key: 'efficiency', category: 'budget', level: 3, name: 'Verimli Tedarik', desc: 'Güvenlik duvarı yükseltmeleri %15 ucuz.', mods: { firewallCost: 0.85 } },
    { key: 'dividend', category: 'budget', level: 6, name: 'Temettü Protokolü', desc: 'Saniyelik ₵ geliri +%10.', mods: { income: 1.1 } },

    { key: 'hardened', category: 'defense', level: 2, name: 'Sertleştirilmiş Çekirdek', desc: 'Tüm düğümler +1 güvenlik duvarıyla başlar.', mods: { startFirewall: 1 } },
    { key: 'quarantine', category: 'defense', level: 5, name: 'Sessiz Karantina', desc: 'İzole etmek anlık panik yaratmaz; izole düğümlerin panik baskısı %30 düşük.', mods: { isolatePanicSpike: false, isolatePressure: 0.7 } },
    { key: 'purge_plus', category: 'defense', level: 8, name: 'Derin Temizlik', desc: 'Anti-YZ temizliği +10 puan daha düşürür.', mods: { purgeAmount: 10 } },

    { key: 'fast_decrypt', category: 'research', level: 2, name: 'Hızlı Deşifre', desc: 'Çekirdek şifre çözüm hızı +%15.', mods: { decryptBase: 1.15 } },
    { key: 'cheap_tech', category: 'research', level: 4, name: 'Açık Bilim', desc: 'Savunma Ağacı geliştirmeleri %20 ucuz.', mods: { techCost: 0.8 } },
    { key: 'head_start', category: 'research', level: 7, name: 'Önceden Sızdırılmış Kod', desc: 'Göreve %5 deşifre ile başla.', mods: { startDecrypt: 5 } },

    { key: 'calm', category: 'society', level: 1, name: 'Soğukkanlı Sözcü', desc: 'Küresel panik her saniye ek 0,2 puan toparlanır.', mods: { panicRecovery: 0.2 } },
    { key: 'media_team', category: 'society', level: 4, name: 'Medya Ekibi', desc: 'Kriz kartlarının panik etkileri yarıya iner.', mods: { dilemmaPanic: 0.5 } },
    { key: 'resilient', category: 'society', level: 9, name: 'Dirençli Toplum', desc: 'Tüm panik baskısı %15 düşük.', mods: { panicRate: 0.85 } },

    { key: 'breach_time', category: 'ops', level: 3, name: 'Erken Uyarı', desc: 'Sıfırıncı gün saldırısı geri sayımı +3 sn.', mods: { breachSeconds: 3 } },
    { key: 'bubble_eye', category: 'ops', level: 5, name: 'Keskin Göz', desc: 'Baloncuklar 3 sn daha uzun kalır; veri baloncuğu +10 ₵.', mods: { bubbleTtl: 3, dataBudget: 10 } },
    { key: 'sentinel', category: 'ops', level: 10, name: 'Nöbetçi Ağ', desc: 'YZ\'nin arka kapı açma aralığı %30 uzar.', mods: { reseedEvery: 1.3 } },
]);

export const GENE_BY_KEY = Object.freeze(Object.fromEntries(GENES.map((g) => [g.key, g])));

export function unlockedGenes(xp) {
    const { level } = levelFor(xp);
    return GENES.filter((g) => g.level <= level).map((g) => g.key);
}

/** Geçersiz / kilitli / aynı kategoriden ikinci genleri eler; en fazla kategori başına bir. */
export function sanitizeGenes(keys, xp = Infinity) {
    const unlocked = new Set(xp === Infinity ? GENES.map((g) => g.key) : unlockedGenes(xp));
    const seenCat = new Set();
    const out = [];
    for (const k of Array.isArray(keys) ? keys : []) {
        const g = GENE_BY_KEY[k];
        if (!g || !unlocked.has(k) || seenCat.has(g.category)) continue;
        seenCat.add(g.category);
        out.push(k);
    }
    return out;
}

/** Kuşanılan genlerin birleşik etkisi (çarpanlar çarpılır, toplamlar toplanır). */
export function geneMods(keys) {
    const m = {
        startBudget: 0, firewallCost: 1, income: 1, startFirewall: 0, isolatePanicSpike: true, isolatePressure: 1, purgeAmount: 0,
        decryptBase: 1, techCost: 1, startDecrypt: 0, panicRecovery: 0, dilemmaPanic: 1, panicRate: 1, breachSeconds: 0, bubbleTtl: 0,
        dataBudget: 0, reseedEvery: 1,
    };
    for (const k of sanitizeGenes(keys)) {
        const g = GENE_BY_KEY[k].mods;
        for (const f in g) {
            if (typeof g[f] === 'boolean') m[f] = g[f];
            else if (['firewallCost', 'income', 'isolatePressure', 'decryptBase', 'techCost', 'dilemmaPanic', 'panicRate', 'reseedEvery'].includes(f)) m[f] *= g[f];
            else m[f] += g[f];
        }
    }
    return m;
}

/** Yeni XP toplamıyla açılan genler (eski toplamda kilitli olanlar). */
export function newlyUnlocked(prevXp, nextXp) {
    const before = new Set(unlockedGenes(prevXp));
    return unlockedGenes(nextXp).filter((k) => !before.has(k)).map((k) => GENE_BY_KEY[k]);
}
