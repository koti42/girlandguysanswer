/**
 * Jeton Mağazası ve cüzdan yönetimi için saf yardımcılar (bileşen değil;
 * testleri node ortamında). Sözleşme: SPEC_V2 §F.4–F.7.
 *
 * Tasarım verisi koddan gelir (src/game/shop/designs, avatar kataloğu):
 * admin yeni ürünü YALNIZCA bu anahtarlardan seçebilir; serbest SVG/HTML
 * girişi yoktur. Backend izinli anahtar listesini ayrıca config'te tutar.
 */
import { FRAMES } from '../../../game/shop/designs/frames';
import { MINIS } from '../../../game/shop/designs/minis';
import { RARITY, TITLES } from '../../../game/shop/designs/titles';
import { SLOTS, STYLES } from '../../../game/avatar/catalog';

export const SHOP_CATEGORIES = [
    { key: 'frame', label: 'Profil çerçevesi' },
    { key: 'mini_avatar', label: 'Mini avatar' },
    { key: 'title', label: 'Unvan' },
    { key: 'avatar_part', label: 'Karakter parçası' },
    { key: 'consumable', label: 'Tüketilebilir' },
];

export const categoryLabel = (key) => SHOP_CATEGORIES.find((c) => c.key === key)?.label || key || '—';

const RARITY_TONES = { common: 'neutral', rare: 'info', epic: 'accent', legendary: 'warning' };

export const RARITIES = Object.entries(RARITY)
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, r]) => ({ key, label: r.label, tone: RARITY_TONES[key] || 'neutral' }));

export const rarityOf = (key) => RARITIES.find((r) => r.key === key) || { key, label: key || '—', tone: 'neutral' };

/** Mesaj Bileti (§F.6): tasarım dosyası yok, kategori consumable. */
const CONSUMABLES = [
    { key: 'ticket:message', category: 'consumable', name: 'Mesaj Bileti', rarity: 'epic', description: 'Mesaj almayı kapatmış bir kişiye tek seferlik, kurallı mesaj gönderme hakkı.' },
];

const slotLabel = (slot) => SLOTS.find((s) => s.id === slot)?.label || slot;

/** Karakter parçaları: catalog.js'teki her stil ("none" hariç) → "slot:style". */
const AVATAR_PARTS = Object.entries(STYLES).flatMap(([slot, styles]) => styles
    .filter((s) => s.id !== 'none')
    .map((s) => ({ key: `${slot}:${s.id}`, category: 'avatar_part', name: `${slotLabel(slot)}: ${s.label}`, rarity: 'common', description: '' })));

const fromDesign = (d) => ({ key: d.id, category: d.category, name: d.name, rarity: d.rarity, description: d.description || '' });

/** Koddaki tüm tasarım anahtarları (yeni ürün seçimi için tek kaynak). */
export const DESIGN_CATALOG = [
    ...FRAMES.map(fromDesign),
    ...MINIS.map(fromDesign),
    ...TITLES.map(fromDesign),
    ...CONSUMABLES,
    ...AVATAR_PARTS,
];

const DESIGN_INDEX = new Map(DESIGN_CATALOG.map((d) => [d.key, d]));
export const designOf = (key) => DESIGN_INDEX.get(key) || null;

/** Henüz mağazada olmayan tasarımlar, kategoriye göre gruplu. */
export function availableDesigns(existingKeys = []) {
    const taken = new Set(existingKeys);
    return SHOP_CATEGORIES
        .map((c) => ({ ...c, items: DESIGN_CATALOG.filter((d) => d.category === c.key && !taken.has(d.key)) }))
        .filter((g) => g.items.length);
}

/* ------------------------------------------------------------ sınırlar */

export const LIMITS = {
    name: 100,
    description: 500,
    price: 1_000_000,
    sortOrder: 100_000,
    maxPerUser: 1_000,
    adjust: 1_000_000,
    reason: 255,
};

/** "12" → 12; boş, ondalıklı ya da sayı olmayan → NaN. */
export function toInt(v) {
    const s = String(v ?? '').trim();
    if (!/^-?\d+$/.test(s)) return Number.NaN;
    return Number(s);
}

const isActiveFlag = (v) => v !== false && v !== 0 && v !== '0';

/* ------------------------------------------------------------ tarih-saat */

const pad = (n) => String(n).padStart(2, '0');

/** ISO → datetime-local değeri (tarayıcının yerel saati, "YYYY-MM-DDTHH:mm"). */
export function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local değeri → ISO (UTC); boş → null, geçersiz → undefined. */
export function fromLocalInput(v) {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Satış aralığının şu andaki durumu: 'scheduled' (henüz başlamadı) | 'expired' | 'live' | null (sınırsız). */
export function saleWindowState(item, now = Date.now()) {
    const from = item?.available_from ? new Date(item.available_from).getTime() : null;
    const until = item?.available_until ? new Date(item.available_until).getTime() : null;
    if (until !== null && Number.isFinite(until) && until <= now) return 'expired';
    if (from !== null && Number.isFinite(from) && from > now) return 'scheduled';
    if (from !== null || until !== null) return 'live';
    return null;
}

/* ------------------------------------------------------------ ürün formu */

/** Admin listesindeki kilit bilgisi `unlock` nesnesi ya da düz alanlar olabilir. */
export function unlockOf(item) {
    if (item?.unlock && typeof item.unlock === 'object') return item.unlock;
    const type = item?.unlock_type || 'price';
    const v = item?.unlock_value;
    if (type === 'level') return { type, level: Number(v) || null };
    if (type === 'badge') return { type, badge: v || null };
    return { type };
}

export const unlockLabel = (u) => {
    if (!u || u.type === 'price') return null;
    if (u.type === 'free') return 'Ücretsiz';
    if (u.type === 'level') return `Seviye ${u.level ?? '?'}`;
    if (u.type === 'badge') return `Rozet: ${u.badge ?? '?'}`;
    return String(u.type);
};

export const isActiveItem = (item) => isActiveFlag(item?.is_active);
export const isFeaturedItem = (item) => !!item?.is_featured && item.is_featured !== '0';

export function itemToForm(item = {}) {
    return {
        name: item.name || '',
        description: item.description || '',
        price: item.price === undefined || item.price === null ? '0' : String(item.price),
        rarity: item.rarity || 'common',
        is_active: isActiveItem(item),
        is_featured: isFeaturedItem(item),
        sort_order: item.sort_order === undefined || item.sort_order === null ? '0' : String(item.sort_order),
        available_from: toLocalInput(item.available_from),
        available_until: toLocalInput(item.available_until),
        max_per_user: item.max_per_user === undefined || item.max_per_user === null ? '' : String(item.max_per_user),
    };
}

/** Yeni ürün formu: tasarımın adı/açıklaması/nadirliği hazır gelir. */
export function designToForm(design) {
    return {
        ...itemToForm({ name: design?.name, description: design?.description, rarity: design?.rarity, is_active: true, price: 0, sort_order: 0 }),
        key: design?.key || '',
        category: design?.category || '',
    };
}

/**
 * İstemci tarafı doğrulama (sunucu da doğrular; bu yalnızca hızlı geri
 * bildirim). `fields` verilirse yalnızca o alanlara bakar (satır içi düzenleme).
 */
export function validateItemForm(form, { category, fields } = {}) {
    const errors = {};
    const want = (k) => !fields || fields.includes(k);
    if (want('name')) {
        if (!String(form.name ?? '').trim()) errors.name = 'Ad gerekli.';
        else if (String(form.name).trim().length > LIMITS.name) errors.name = `En fazla ${LIMITS.name} karakter.`;
    }
    if (want('description') && String(form.description ?? '').trim().length > LIMITS.description) errors.description = `En fazla ${LIMITS.description} karakter.`;
    if (want('price')) {
        const p = toInt(form.price);
        if (!Number.isInteger(p) || p < 0) errors.price = 'Fiyat 0 ya da pozitif tam sayı olmalı.';
        else if (p > LIMITS.price) errors.price = `Fiyat en fazla ${LIMITS.price.toLocaleString('tr-TR')} olabilir.`;
    }
    if (want('sort_order')) {
        const s = toInt(form.sort_order);
        if (!Number.isInteger(s) || s < 0 || s > LIMITS.sortOrder) errors.sort_order = `Sıra 0–${LIMITS.sortOrder.toLocaleString('tr-TR')} arası tam sayı olmalı.`;
    }
    if (want('rarity') && !RARITIES.some((r) => r.key === form.rarity)) errors.rarity = 'Nadirlik seçin.';
    if (want('available_from') || want('available_until')) {
        const from = fromLocalInput(form.available_from);
        const until = fromLocalInput(form.available_until);
        if (from === undefined) errors.available_from = 'Geçersiz tarih.';
        if (until === undefined) errors.available_until = 'Geçersiz tarih.';
        if (from && until && new Date(until) <= new Date(from)) errors.available_until = 'Bitiş, başlangıçtan sonra olmalı.';
    }
    if (want('max_per_user') && category === 'consumable' && String(form.max_per_user ?? '').trim() !== '') {
        const m = toInt(form.max_per_user);
        if (!Number.isInteger(m) || m < 1 || m > LIMITS.maxPerUser) errors.max_per_user = `1–${LIMITS.maxPerUser.toLocaleString('tr-TR')} arası tam sayı ya da boş (sınırsız).`;
    }
    return errors;
}

/** Formu sözleşmedeki gövdeye çevirir (tüm alanlar). */
export function formToBody(form, { category } = {}) {
    const body = {
        name: String(form.name).trim(),
        description: String(form.description ?? '').trim() || null,
        price: toInt(form.price),
        rarity: form.rarity,
        is_active: !!form.is_active,
        is_featured: !!form.is_featured,
        sort_order: toInt(form.sort_order),
        available_from: fromLocalInput(form.available_from) ?? null,
        available_until: fromLocalInput(form.available_until) ?? null,
    };
    // max_per_user yalnızca tüketilebilirde anlamlı (kozmetik zaten tek adet).
    if (category === 'consumable') body.max_per_user = String(form.max_per_user ?? '').trim() === '' ? null : toInt(form.max_per_user);
    return body;
}

const sameInstant = (a, b) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return new Date(a).getTime() === new Date(b).getTime();
};

/**
 * PUT gövdesi: yalnızca değişen alanlar (başka bir yöneticinin aynı anda
 * yaptığı ilgisiz değişiklikleri ezmemek için). Değişiklik yoksa {}.
 */
export function itemPatch(item, form) {
    const category = item?.category;
    const next = formToBody(form, { category });
    const prev = formToBody(itemToForm(item), { category });
    const patch = {};
    Object.keys(next).forEach((k) => {
        const same = k === 'available_from' || k === 'available_until' ? sameInstant(prev[k], next[k]) : prev[k] === next[k];
        if (!same) patch[k] = next[k];
    });
    return patch;
}

/* ------------------------------------------------------------ cüzdan */

export const TX_TYPES = {
    earn_runner: { label: 'Koşu kazancı', tone: 'success' },
    earn_tower: { label: 'Kule kazancı', tone: 'success' },
    purchase: { label: 'Satın alma', tone: 'info' },
    admin_grant: { label: 'Yönetici verdi', tone: 'accent' },
    admin_deduct: { label: 'Yönetici kesti', tone: 'danger' },
    refund: { label: 'İade', tone: 'warning' },
    backfill: { label: 'Geçmiş aktarım', tone: 'neutral' },
};

export const txTypeOf = (type) => (Object.prototype.hasOwnProperty.call(TX_TYPES, type) ? TX_TYPES[type] : { label: type ? String(type) : '—', tone: 'neutral' });

/** Jeton ver/kes formu doğrulaması. mode: 'grant' | 'deduct'. */
export function validateAdjust({ mode, amount, reason }, balance) {
    const errors = {};
    const a = toInt(amount);
    if (!Number.isInteger(a) || a <= 0) errors.amount = 'Pozitif tam sayı girin.';
    else if (a > LIMITS.adjust) errors.amount = `En fazla ${LIMITS.adjust.toLocaleString('tr-TR')} jeton.`;
    else if (mode === 'deduct' && Number.isFinite(Number(balance)) && a > Number(balance)) errors.amount = `Bakiye yetersiz: en fazla ${Number(balance).toLocaleString('tr-TR')} jeton kesilebilir.`;
    const r = String(reason ?? '').trim();
    if (!r) errors.reason = 'Gerekçe zorunlu.';
    else if (r.length > LIMITS.reason) errors.reason = `En fazla ${LIMITS.reason} karakter.`;
    return errors;
}

/** Sunucuya giden işaretli miktar. */
export const signedAmount = (mode, amount) => (mode === 'deduct' ? -1 : 1) * toInt(amount);

/** Bir cevaptaki listeyi ve sayfalamayı bulur ({ transactions: [...] , pagination } ya da { transactions: { data, pagination } }). */
export function pagedList(data, key) {
    const raw = data?.[key];
    if (Array.isArray(raw)) return { rows: raw, pagination: data?.pagination || null };
    if (raw && typeof raw === 'object') {
        const rows = Array.isArray(raw.data) ? raw.data : Array.isArray(raw.items) ? raw.items : [];
        const p = raw.pagination || (raw.current_page !== undefined ? { current_page: raw.current_page, last_page: raw.last_page, total: raw.total, per_page: raw.per_page } : null);
        return { rows, pagination: p };
    }
    return { rows: [], pagination: null };
}
