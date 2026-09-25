/**
 * Panel biçimleyicileri. Hepsi saf: tarih/sayı alır, metin döner.
 */

const RTF = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat
    ? new Intl.RelativeTimeFormat('tr', { numeric: 'auto' })
    : null;

const DIVISIONS = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
];

/** "3 saat önce" / "2 gün sonra". Geçersiz girdide boş string. */
export function relativeTime(value, now = Date.now()) {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    let duration = (date.getTime() - now) / 1000;
    if (!RTF) return date.toLocaleString('tr-TR');
    for (const division of DIVISIONS) {
        if (Math.abs(duration) < division.amount) {
            return RTF.format(Math.round(duration), division.unit);
        }
        duration /= division.amount;
    }
    return '';
}

export function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** 12500 -> "12,5B", 1250000 -> "1,3M". Küçük sayılar olduğu gibi. */
export function compactNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    const abs = Math.abs(num);
    if (abs < 1000) return String(Math.round(num));
    if (abs < 1_000_000) return (num / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'B';
    if (abs < 1_000_000_000) return (num / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'M';
    return (num / 1_000_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'Mr';
}

export function formatNumber(n) {
    const num = Number(n);
    return Number.isFinite(num) ? num.toLocaleString('tr-TR') : '0';
}

export function formatBytes(bytes) {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
    return (b / 1024 ** i).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' ' + units[i];
}

/** Değişim yüzdesi; önceki 0 ise ve şimdiki > 0 ise +100 sayılır. */
export function percentChange(current, previous) {
    const c = Number(current) || 0;
    const p = Number(previous) || 0;
    if (p === 0) return c === 0 ? 0 : 100;
    return Math.round(((c - p) / p) * 100);
}

export function truncate(text, max = 120) {
    const s = String(text ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** "42s" / "3g 4s" biçiminde saat cinsinden süre. */
export function hoursLabel(hours) {
    // Number(null) === 0: bekleyen şikâyet yokken "<1s" değil "—" görünmeli.
    if (hours === null || hours === undefined || hours === '') return '—';
    const h = Number(hours);
    if (!Number.isFinite(h) || h < 0) return '—';
    if (h < 1) return '<1s';
    if (h < 24) return `${Math.round(h)}s`;
    const d = Math.floor(h / 24);
    const rem = Math.round(h % 24);
    return rem ? `${d}g ${rem}s` : `${d}g`;
}
