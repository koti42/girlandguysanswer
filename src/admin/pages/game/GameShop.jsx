import React, { useEffect, useState } from 'react';
import { FaPen, FaPlus, FaSave, FaStar, FaUndo } from 'react-icons/fa';
import { gameAdminApi } from '../../gameAdminApi';
import { errorMessage } from '../../../panel/api/client';
import { useQuery } from '../../../panel/hooks/useQuery';
import { useToast } from '../../../panel/hooks/useToast';
import { Badge, Button, Card, DataTable, Field, Input, Modal, SearchInput, Select, Switch, Textarea } from '../../../panel/ui';
import { formatDateTime, formatNumber } from '../../../panel/lib/format';
import { fieldErrors, listOf, toPagination } from './gameUtils';
import {
    LIMITS, RARITIES, SHOP_CATEGORIES, availableDesigns, categoryLabel, designOf, designToForm, formToBody, isActiveItem,
    isFeaturedItem, itemPatch, itemToForm, rarityOf, saleWindowState, unlockLabel, unlockOf, validateItemForm,
} from './shopUtils';
import ShopItemPreview from './ShopItemPreview';

const EMPTY_FILTERS = { search: '', category: '', rarity: '', active: '' };
/** Tabloda satır içinde düzenlenen alanlar; geri kalanı düzenleme penceresinde. */
const INLINE_FIELDS = ['price', 'sort_order'];
const inlineOf = (item) => {
    const f = itemToForm(item);
    return { price: f.price, sort_order: f.sort_order, is_active: f.is_active, is_featured: f.is_featured };
};
const sameInline = (a, b) => a.price === b.price && a.sort_order === b.sort_order && a.is_active === b.is_active && a.is_featured === b.is_featured;
const WINDOW_BADGE = { expired: { label: 'Süresi doldu', tone: 'danger' }, scheduled: { label: 'Yakında', tone: 'info' }, live: { label: 'Satışta', tone: 'success' } };

/** Tablo içi küçük anahtar: Switch'ten farkı görünmez etiketle (aria-label) gelmesi. */
function MiniSwitch({ checked, onChange, label, disabled }) {
    return (
        <button type="button" role="switch" aria-checked={checked} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!checked)}
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors p-ring disabled:opacity-50 ${checked ? 'bg-[var(--p-accent)]' : 'p-fill-strong'}`}>
            <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
        </button>
    );
}

function NumberCell({ value, onChange, label, error, disabled, width = 'w-24' }) {
    return (
        <span className="inline-flex flex-col">
            <input type="number" inputMode="numeric" min={0} step={1} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
                aria-label={label} aria-invalid={error ? 'true' : undefined} title={error || undefined}
                className={`${width} h-8 rounded-md p-inset border px-2 text-sm tabular-nums text-right text-[var(--p-text)] p-ring disabled:opacity-50 ${error ? 'border-rose-500' : 'border-[var(--p-border)]'}`} />
            {error && <span className="text-[10px] p-tone-danger mt-0.5 max-w-[10rem] whitespace-normal">{error}</span>}
        </span>
    );
}

/** Ad/açıklama/fiyat/nadirlik/sıra/vitrin/aktif/satış aralığı/max_per_user alanları (düzenle ve yeni ürün ortak). */
function ItemFields({ form, setF, errors, category }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ad *" error={errors.name} className="sm:col-span-2"><Input value={form.name} onChange={(e) => setF('name', e.target.value)} maxLength={LIMITS.name} data-testid="item-name" /></Field>
            <Field label="Açıklama" error={errors.description} className="sm:col-span-2"><Textarea rows={2} value={form.description} onChange={(e) => setF('description', e.target.value)} maxLength={LIMITS.description} /></Field>
            <Field label="Fiyat (jeton) *" error={errors.price}><Input type="number" inputMode="numeric" min={0} max={LIMITS.price} step={1} value={form.price} onChange={(e) => setF('price', e.target.value)} data-testid="item-price" /></Field>
            <Field label="Nadirlik" error={errors.rarity}>
                <Select value={form.rarity} onChange={(e) => setF('rarity', e.target.value)} aria-label="Ürün nadirliği">
                    {RARITIES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </Select>
            </Field>
            <Field label="Sıra" hint="Küçük sayı önce gösterilir." error={errors.sort_order}><Input type="number" inputMode="numeric" min={0} step={1} value={form.sort_order} onChange={(e) => setF('sort_order', e.target.value)} /></Field>
            {category === 'consumable' ? (
                <Field label="Kişi başı en fazla" hint="Boş = sınırsız" error={errors.max_per_user}><Input type="number" inputMode="numeric" min={1} max={LIMITS.maxPerUser} step={1} value={form.max_per_user} onChange={(e) => setF('max_per_user', e.target.value)} aria-label="Kişi başı en fazla" /></Field>
            ) : <div className="hidden sm:block" />}
            <Field label="Satış başlangıcı" hint="Boş = hemen" error={errors.available_from}><Input type="datetime-local" value={form.available_from} onChange={(e) => setF('available_from', e.target.value)} aria-label="Satış başlangıcı" /></Field>
            <Field label="Satış bitişi" hint="Boş = süresiz (vitrinde geri sayım bitişe göre)" error={errors.available_until}><Input type="datetime-local" value={form.available_until} onChange={(e) => setF('available_until', e.target.value)} aria-label="Satış bitişi" /></Field>
            <p className="sm:col-span-2 text-[11px] p-muted -mt-1">Saatler tarayıcınızın saat diliminde girilir, sunucuya UTC olarak gönderilir.</p>
            <Switch checked={!!form.is_featured} onChange={(v) => setF('is_featured', v)} label="Vitrinde" description="Mağazanın üstündeki vitrin şeridinde gösterilir." />
            <Switch checked={!!form.is_active} onChange={(v) => setF('is_active', v)} label="Aktif" description="Pasif ürün satılmaz; sahip olanlar kullanmaya devam eder." />
        </div>
    );
}

/** Önce gelen birkaç sayfayı tarayıp mağazadaki tüm anahtarları toplar (yeni ürün seçiminde mükerrer önlemek için). */
async function fetchAllKeys(maxPages = 10) {
    const keys = [];
    for (let page = 1; page <= maxPages; page += 1) {
        const r = await gameAdminApi.shopItems({ page, per_page: 100 });
        const body = r?.data?.data ?? r?.data ?? {};
        listOf(body, 'items').forEach((it) => it?.key && keys.push(it.key));
        const p = toPagination(body.pagination);
        if (!body.pagination || p.current_page >= p.total_pages) break;
    }
    return keys;
}

/**
 * Jeton Mağazası ürünleri (§F.7): filtreli liste, satır içi hızlı düzenleme
 * (fiyat/sıra/vitrin/aktif; satır ya da toplu kaydet/geri al), tam düzenleme
 * penceresi ve yalnızca koddaki tasarımlardan yeni ürün.
 */
export default function GameShop() {
    const toast = useToast();
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [page, setPage] = useState(1);
    const list = useQuery(() => gameAdminApi.shopItems({ ...filters, page }), [filters, page]);
    const rows = listOf(list.data, 'items');
    const pagination = toPagination(list.data?.pagination, rows.length);
    const setFilter = (k) => (v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
    const filtered = Object.values(filters).some((v) => v !== '');

    // Satır içi taslaklar: key → { item (orijinal), values, error? }. Sayfa/filtre değişse de korunur.
    const [drafts, setDrafts] = useState({});
    const [saving, setSaving] = useState(() => new Set());
    const dirtyKeys = Object.keys(drafts);
    const dirty = dirtyKeys.length > 0;

    useEffect(() => {
        if (!dirty) return undefined;
        const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const valuesOf = (item) => drafts[item.key]?.values || inlineOf(item);
    const inlineErrors = (values) => validateItemForm(values, { fields: INLINE_FIELDS });

    const setInline = (item, field, value) => setDrafts((d) => {
        const base = d[item.key]?.values || inlineOf(item);
        const values = { ...base, [field]: value };
        const next = { ...d };
        if (sameInline(values, inlineOf(d[item.key]?.item || item))) delete next[item.key];
        else next[item.key] = { item: d[item.key]?.item || item, values };
        return next;
    });
    const undo = (key) => setDrafts((d) => { const next = { ...d }; delete next[key]; return next; });

    const markSaving = (key, on) => setSaving((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });

    /** Bir taslağı kaydeder; başarıda true. Hata taslağın üstüne yazılır (toplu kayıtta toast tek seferde). */
    const persist = async (key) => {
        const draft = drafts[key];
        if (!draft) return true;
        const errs = inlineErrors(draft.values);
        if (Object.keys(errs).length) {
            setDrafts((d) => (d[key] ? { ...d, [key]: { ...d[key], error: Object.values(errs)[0] } } : d));
            return false;
        }
        const patch = itemPatch(draft.item, { ...itemToForm(draft.item), ...draft.values });
        if (!Object.keys(patch).length) { undo(key); return true; }
        markSaving(key, true);
        try {
            await gameAdminApi.updateShopItem(key, patch);
            undo(key);
            return true;
        } catch (e) {
            const msg = errorMessage(e);
            setDrafts((d) => (d[key] ? { ...d, [key]: { ...d[key], error: msg } } : d));
            return false;
        } finally { markSaving(key, false); }
    };

    const saveRow = async (key) => {
        const ok = await persist(key);
        if (ok) { toast.success('Ürün kaydedildi.'); list.refetch(); } else toast.error('Ürün kaydedilemedi; satırdaki hatayı düzeltin.');
    };

    const [bulkBusy, setBulkBusy] = useState(false);
    const saveAll = async () => {
        setBulkBusy(true);
        let ok = 0;
        let fail = 0;
        // Sırayla: aynı anda onlarca PUT atıp sunucu kısıtlamasına (throttle) takılmayalım.
        for (const key of dirtyKeys) {
            if (await persist(key)) ok += 1; else fail += 1;
        }
        setBulkBusy(false);
        if (ok) list.refetch();
        if (fail) toast.error(`${ok} ürün kaydedildi, ${fail} ürün kaydedilemedi.`);
        else toast.success(`${ok} ürün kaydedildi.`);
    };

    /* ---------------------------------------------------- düzenleme penceresi */
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(() => itemToForm());
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const openEdit = (item) => {
        setErrors({});
        // Satırda kaydedilmemiş değişiklik varsa pencere onlarla açılır (tek kaynak).
        setForm({ ...itemToForm(item), ...(drafts[item.key]?.values || {}) });
        setEditing(item);
    };
    const closeEdit = () => { if (!busy) setEditing(null); };

    const saveEdit = async () => {
        const errs = validateItemForm(form, { category: editing.category });
        setErrors(errs);
        if (Object.keys(errs).length) return;
        const patch = itemPatch(editing, form);
        if (!Object.keys(patch).length) { toast.info('Değişiklik yok.'); undo(editing.key); setEditing(null); return; }
        setBusy(true);
        try {
            const r = await gameAdminApi.updateShopItem(editing.key, patch);
            toast.success(r?.data?.message || 'Ürün kaydedildi.');
            undo(editing.key);
            setEditing(null);
            list.refetch();
        } catch (e) {
            const fe = fieldErrors(e);
            if (fe) setErrors(fe);
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    /* ---------------------------------------------------- yeni ürün */
    const [creating, setCreating] = useState(false);
    const [existing, setExisting] = useState({ loading: false, keys: null, error: null });
    const [newForm, setNewForm] = useState(() => designToForm(null));
    const [newErrors, setNewErrors] = useState({});
    const setN = (k, v) => setNewForm((f) => ({ ...f, [k]: v }));
    const newGroups = creating ? availableDesigns(existing.keys || rows.map((r) => r.key)) : [];

    const openCreate = async () => {
        setNewErrors({});
        setNewForm(designToForm(null));
        setCreating(true);
        setExisting({ loading: true, keys: null, error: null });
        try { setExisting({ loading: false, keys: await fetchAllKeys(), error: null }); }
        catch (e) { setExisting({ loading: false, keys: null, error: errorMessage(e) }); }
    };
    const pickDesign = (key) => {
        const d = designOf(key);
        setNewErrors({});
        setNewForm(d ? { ...designToForm(d), price: newForm.price, is_active: newForm.is_active } : designToForm(null));
    };
    const closeCreate = () => { if (!busy) setCreating(false); };

    const saveCreate = async () => {
        const errs = validateItemForm(newForm, { category: newForm.category });
        if (!newForm.key || !designOf(newForm.key)) errs.key = 'Koddaki tasarımlardan birini seçin.';
        setNewErrors(errs);
        if (Object.keys(errs).length) return;
        setBusy(true);
        try {
            const r = await gameAdminApi.createShopItem({ key: newForm.key, category: newForm.category, ...formToBody(newForm, { category: newForm.category }) });
            toast.success(r?.data?.message || 'Ürün eklendi.');
            setCreating(false);
            list.refetch();
        } catch (e) {
            const fe = fieldErrors(e);
            if (fe) setNewErrors(fe);
            toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    /* ---------------------------------------------------- tablo */
    const columns = [
        { key: 'preview', label: '', width: 64, render: (it) => <ShopItemPreview itemKey={it.key} size={44} /> },
        { key: 'name', label: 'Ürün', render: (it) => (
            <div className="min-w-[180px] max-w-xs">
                <p className="text-sm font-medium leading-snug break-words flex items-center gap-1">
                    {isFeaturedItem(valuesOf(it)) && <FaStar className="text-amber-400 shrink-0 text-xs" aria-label="Vitrinde" />}
                    {it.name || it.key}
                </p>
                <code className="block text-[10px] p-muted truncate">{it.key}</code>
                <span className="text-[11px] p-muted">{categoryLabel(it.category)}</span>
            </div>
        ) },
        { key: 'rarity', label: 'Nadirlik', width: 100, render: (it) => { const r = rarityOf(it.rarity); return <Badge size="xs" tone={r.tone}>{r.label}</Badge>; } },
        { key: 'price', label: 'Fiyat', width: 120, render: (it) => {
            const v = valuesOf(it);
            const u = unlockLabel(unlockOf(it));
            return (
                <span className="inline-flex flex-col gap-0.5">
                    <NumberCell value={v.price} onChange={(x) => setInline(it, 'price', x)} label={`Fiyat: ${it.name || it.key}`} error={drafts[it.key] && inlineErrors(v).price} disabled={saving.has(it.key)} />
                    {u && <Badge size="xs" tone="info" className="self-start">{u}</Badge>}
                </span>
            );
        } },
        { key: 'sold', label: 'Satış', width: 70, align: 'right', render: (it) => <span className="tabular-nums">{formatNumber(it.sold_count ?? 0)}</span> },
        { key: 'sort_order', label: 'Sıra', width: 90, render: (it) => <NumberCell width="w-16" value={valuesOf(it).sort_order} onChange={(x) => setInline(it, 'sort_order', x)} label={`Sıra: ${it.name || it.key}`} error={drafts[it.key] && inlineErrors(valuesOf(it)).sort_order} disabled={saving.has(it.key)} /> },
        { key: 'is_featured', label: 'Vitrin', width: 70, render: (it) => <MiniSwitch checked={valuesOf(it).is_featured} onChange={(x) => setInline(it, 'is_featured', x)} label={`Vitrin: ${it.name || it.key}`} disabled={saving.has(it.key)} /> },
        { key: 'is_active', label: 'Aktif', width: 70, render: (it) => <MiniSwitch checked={valuesOf(it).is_active} onChange={(x) => setInline(it, 'is_active', x)} label={`Aktif: ${it.name || it.key}`} disabled={saving.has(it.key)} /> },
        { key: 'window', label: 'Satış aralığı', width: 150, render: (it) => {
            const st = saleWindowState(it);
            if (!st) return <span className="text-xs p-muted">Süresiz</span>;
            const b = WINDOW_BADGE[st];
            return (
                <span className="inline-flex flex-col gap-0.5 text-[11px]">
                    <Badge size="xs" tone={b.tone} className="self-start">{b.label}</Badge>
                    {it.available_from && <span className="whitespace-nowrap">↦ {formatDateTime(it.available_from)}</span>}
                    {it.available_until && <span className="whitespace-nowrap">⇥ {formatDateTime(it.available_until)}</span>}
                </span>
            );
        } },
        { key: '_actions', label: '', width: 120, render: (it) => {
            const d = drafts[it.key];
            const name = it.name || it.key;
            return (
                <div className="flex flex-col items-end gap-1">
                    <Button size="xs" variant="secondary" icon={FaPen} onClick={() => openEdit(it)} aria-label={`Düzenle: ${name}`}>Düzenle</Button>
                    {d && (
                        <div className="flex gap-1">
                            <Button size="xs" variant="primary" icon={FaSave} loading={saving.has(it.key)} onClick={() => saveRow(it.key)} aria-label={`Kaydet: ${name}`} title="Kaydet" />
                            <Button size="xs" variant="ghost" icon={FaUndo} disabled={saving.has(it.key)} onClick={() => undo(it.key)} aria-label={`Geri al: ${name}`} title="Geri al" />
                        </div>
                    )}
                    {d?.error && <span className="text-[10px] p-tone-danger max-w-[10rem] text-right whitespace-normal" role="alert">{d.error}</span>}
                </div>
            );
        } },
    ];

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={filters.search} onChange={setFilter('search')} placeholder="Ad ya da anahtarda ara" className="w-full sm:w-64" />
                <Select value={filters.category} onChange={(e) => setFilter('category')(e.target.value)} className="w-full sm:w-auto" aria-label="Kategori">
                    <option value="">Tüm kategoriler</option>
                    {SHOP_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </Select>
                <Select value={filters.rarity} onChange={(e) => setFilter('rarity')(e.target.value)} className="w-[calc(50%-0.25rem)] sm:w-auto" aria-label="Nadirlik">
                    <option value="">Tüm nadirlikler</option>
                    {RARITIES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </Select>
                <Select value={filters.active} onChange={(e) => setFilter('active')(e.target.value)} className="w-[calc(50%-0.25rem)] sm:w-auto" aria-label="Durum">
                    <option value="">Aktif + pasif</option>
                    <option value="1">Aktif</option>
                    <option value="0">Pasif</option>
                </Select>
                {filtered && <Button size="sm" variant="ghost" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>Temizle</Button>}
                <Button size="sm" variant="primary" icon={FaPlus} className="sm:ml-auto" onClick={openCreate}>Yeni ürün</Button>
            </div>

            {dirty && (
                <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2" role="status" data-testid="shop-bulk-bar">
                    <span className="text-sm flex-1 min-w-[200px]">
                        <b>{dirtyKeys.length}</b> üründe kaydedilmemiş değişiklik
                        <span className="block text-[11px] p-muted truncate">{dirtyKeys.map((k) => drafts[k].item?.name || k).join(', ')}</span>
                    </span>
                    <Button size="sm" variant="ghost" icon={FaUndo} disabled={bulkBusy} onClick={() => setDrafts({})}>Tümünü geri al</Button>
                    <Button size="sm" variant="primary" icon={FaSave} loading={bulkBusy} onClick={saveAll}>Tümünü kaydet</Button>
                </div>
            )}

            <Card padded={false}>
                <DataTable columns={columns} rows={rows} rowKey="key" loading={list.loading} error={list.error} onRetry={list.refetch} dense
                    rowTone={(it) => (drafts[it.key] ? 'warning' : isActiveItem(valuesOf(it)) ? undefined : 'muted')}
                    pagination={pagination} onPage={setPage}
                    empty={<p className="py-10 text-center text-xs p-muted">{filtered ? 'Filtreye uyan ürün yok.' : 'Mağazada henüz ürün yok.'}</p>} />
            </Card>

            <Modal open={!!editing} onClose={closeEdit} title="Ürünü düzenle" subtitle={editing?.key} width="max-w-2xl"
                footer={(
                    <>
                        <Button variant="ghost" icon={FaUndo} className="mr-auto" disabled={busy} onClick={() => { setErrors({}); setForm(itemToForm(editing)); }}>Geri al</Button>
                        <Button variant="ghost" onClick={closeEdit}>Vazgeç</Button>
                        <Button variant="primary" loading={busy} onClick={saveEdit} data-testid="item-save">Kaydet</Button>
                    </>
                )}>
                {editing && (
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 rounded-xl p-fill px-3 py-3">
                            <ShopItemPreview itemKey={editing.key} size={88} />
                            <div className="min-w-0 text-xs space-y-1">
                                <div className="flex flex-wrap gap-1.5">
                                    <Badge size="xs">{categoryLabel(editing.category)}</Badge>
                                    <Badge size="xs" tone={rarityOf(form.rarity).tone}>{rarityOf(form.rarity).label}</Badge>
                                    {unlockLabel(unlockOf(editing)) && <Badge size="xs" tone="info">{unlockLabel(unlockOf(editing))}</Badge>}
                                </div>
                                <p className="p-muted">{formatNumber(editing.sold_count ?? 0)} satış</p>
                            </div>
                        </div>
                        <ItemFields form={form} setF={setF} errors={errors} category={editing.category} />
                    </div>
                )}
            </Modal>

            <Modal open={creating} onClose={closeCreate} title="Yeni ürün" subtitle="Yalnızca kodda tasarımı olan anahtarlar eklenebilir." width="max-w-2xl"
                footer={<><Button variant="ghost" onClick={closeCreate}>Vazgeç</Button><Button variant="primary" loading={busy} disabled={!newForm.key} onClick={saveCreate} data-testid="item-create">Ekle</Button></>}>
                <div className="space-y-4">
                    <Field label="Tasarım *" error={newErrors.key} hint={existing.loading ? 'Mağazadaki ürünler kontrol ediliyor…' : existing.error ? `Mevcut ürünler alınamadı (${existing.error}); sunucu mükerrer anahtarı yine reddeder.` : `${newGroups.reduce((n, g) => n + g.items.length, 0)} tasarım henüz mağazada değil.`}>
                        <Select value={newForm.key} onChange={(e) => pickDesign(e.target.value)} aria-label="Tasarım anahtarı" disabled={existing.loading}>
                            <option value="">Seçin</option>
                            {newGroups.map((g) => (
                                <optgroup key={g.key} label={g.label}>
                                    {g.items.map((d) => <option key={d.key} value={d.key}>{d.name} · {d.key}</option>)}
                                </optgroup>
                            ))}
                        </Select>
                    </Field>
                    {newForm.key && (
                        <>
                            <div className="flex items-center gap-4 rounded-xl p-fill px-3 py-3">
                                <ShopItemPreview itemKey={newForm.key} size={88} />
                                <div className="text-xs space-y-1">
                                    <Badge size="xs">{categoryLabel(newForm.category)}</Badge>
                                    <code className="block p-muted">{newForm.key}</code>
                                </div>
                            </div>
                            <ItemFields form={newForm} setF={setN} errors={newErrors} category={newForm.category} />
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}
