import { REPORT_REASONS } from '../../components/game/kesif/kesifUtils';

/*
 * Keşif harita moderasyonu: saf yardımcılar (durum etiketleri, neden özeti, palet adları).
 * Sunucu: AdminGameKesifController (/api/mod/kesif/maps...).
 */

export const MAP_STATUS = {
    ok: { label: 'Yayında / açık', tone: 'success' },
    hidden: { label: 'Gizli', tone: 'warning' },
    removed: { label: 'Kaldırıldı', tone: 'danger' },
};

/** Özel harita "yayında" sayılmaz: etiket görünürlükle birlikte okunur. */
export function statusMeta(map) {
    const base = MAP_STATUS[map?.status] || MAP_STATUS.ok;
    if (map?.status === 'ok' || !map?.status) return map?.visibility === 'public' ? { label: 'Yayında', tone: 'success' } : { label: 'Özel', tone: 'neutral' };
    return base;
}

export const SORTS = [
    { key: 'reports', label: 'Açık rapora göre' },
    { key: 'newest', label: 'En yeni' },
    { key: 'oldest', label: 'En eski' },
];

export const HIDE_PRESETS = [
    'Çocuklara uygun olmayan yapı veya yazı',
    'Nefret / zorbalık içeren yapı veya yazı',
    'Kişisel bilgi içeriyor',
    'Spam / reklam',
    'İnceleme için geçici olarak gizlendi',
];

export const REMOVE_PRESETS = [
    'Çocuk güvenliği ihlali',
    'Nefret / zorbalık içeren içerik',
    'Kişisel bilgi paylaşımı',
    'Tekrarlayan kural ihlali',
    'Spam / reklam',
];

const LABELS = Object.fromEntries(REPORT_REASONS.map((r) => [r.key, r.label]));
export function reasonLabel(key) { return LABELS[key] || key || '-'; }

/** { uygunsuz: 2, spam: 1 } → [{ key, label, count }] (çoktan aza). */
export function reasonSummary(counts) {
    return Object.entries(counts || {})
        .map(([key, count]) => ({ key, label: reasonLabel(key), count: Number(count) || 0 }))
        .filter((r) => r.count > 0)
        .sort((a, b) => b.count - a.count);
}

/** Rapor yaşı: hesap yeni mi (sahte hesap sinyali; sunucu otomatik gizlemede 24 saatten yeni hesabı saymaz). */
export function accountAgeLabel(createdAt, now = Date.now()) {
    const t = new Date(createdAt).getTime();
    if (!createdAt || Number.isNaN(t)) return '';
    const hours = Math.max(0, (now - t) / 3600000);
    if (hours < 24) return 'hesap 24 saatten yeni';
    return `hesap ${Math.floor(hours / 24)} gün`;
}

/** Palet satırı: blok adı sim/blocks.js'ten (lazy), bilinmezse #id. `names` enjekte edilebilir (test). */
export function paletteRows(stats, names) {
    const solid = Number(stats?.solid) || 0;
    return (stats?.palette || []).map((p) => ({
        id: p.id,
        name: (names && names(p.id)) || `Blok #${p.id}`,
        count: p.count,
        pct: solid > 0 ? Math.round((p.count / solid) * 1000) / 10 : 0,
    }));
}

/** Liste/ayrıntıdaki haritaya iyimser durum uygular (açık raporlar işlenmiş sayılır). */
export function withStatus(map, status) {
    return { ...map, status, reports_open: 0, reason_counts: {} };
}
