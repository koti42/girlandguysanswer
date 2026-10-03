import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaArrowDown, FaArrowUp, FaCalendarDay, FaCalendarWeek, FaCoins, FaExternalLinkAlt, FaMinus, FaPlus, FaSync, FaTicketAlt, FaTimes } from 'react-icons/fa';
import { gameAdminApi } from '../../gameAdminApi';
import { errorMessage } from '../../../panel/api/client';
import { useQuery } from '../../../panel/hooks/useQuery';
import { useToast } from '../../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, ConfirmDialog, DataTable, ErrorState, Field, Input, SearchInput, Skeleton, StatCard, Textarea } from '../../../panel/ui';
import { formatDateTime, formatNumber } from '../../../panel/lib/format';
import { fieldErrors, listOf, toPagination } from './gameUtils';
import { LIMITS, categoryLabel, designOf, pagedList, signedAmount, toInt, txTypeOf, validateAdjust } from './shopUtils';
import ShopItemPreview from './ShopItemPreview';

const EMPTY_ADJUST = { mode: 'grant', amount: '', reason: '' };
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function UserChip({ user, onUser, size = 28 }) {
    return (
        <button type="button" disabled={!user?.id} onClick={() => onUser(user.id)} className="flex items-center gap-2 min-w-0 max-w-[11rem] rounded-lg px-1 py-1 text-left p-hover p-ring disabled:cursor-default">
            <Avatar user={user} size={size} />
            <span className="text-sm font-medium truncate">@{user?.username || '?'}</span>
        </button>
    );
}

function Amount({ value }) {
    const n = num(value);
    const tone = n > 0 ? 'p-tone-success' : n < 0 ? 'p-tone-danger' : 'p-muted';
    return <span className={`font-semibold tabular-nums ${tone}`}>{n > 0 ? '+' : ''}{formatNumber(n)}</span>;
}

/** Dolaşım ve kazanılan/harcanan özet kartları + en çok satanlar + Mesaj Bileti kaydı (/admin/game/shop/summary). */
function Summary({ summary, onUser }) {
    const s = summary.data;
    const top = Array.isArray(s?.top_items) ? s.top_items : [];
    const log = (Array.isArray(s?.ticket_log) ? s.ticket_log : []).map((r, i) => ({ ...r, _k: `${r.at || ''}-${i}` }));

    const logCols = [
        { key: 'sender', label: 'Gönderen', width: 150, render: (r) => <UserChip user={r.sender} onUser={onUser} size={24} /> },
        { key: 'recipient', label: 'Alıcı', width: 150, render: (r) => <UserChip user={r.recipient} onUser={onUser} size={24} /> },
        { key: 'at', label: 'Zaman', width: 140, nowrap: true, render: (r) => <span className="text-xs">{formatDateTime(r.at)}</span> },
        { key: 'body', label: 'Mesaj', render: (r) => <p className="text-sm whitespace-pre-wrap break-words min-w-[180px]">{r.body ? String(r.body) : <span className="p-muted">—</span>}</p> },
    ];

    return (
        <>
            {summary.loading && !s ? (
                <div className="grid gap-4 grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
            ) : summary.error ? (
                <Card><ErrorState message={summary.error} onRetry={summary.refetch} /></Card>
            ) : s && (
                <div className="grid gap-3 sm:gap-4 grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]" data-testid="coin-summary">
                    <div className="col-span-2 xl:col-span-1"><StatCard label="Dolaşımdaki jeton" value={formatNumber(s.circulation ?? 0)} sub="Tüm cüzdanların toplamı" icon={FaCoins} tone="warning" /></div>
                    <StatCard label="Bugün kazanılan" value={formatNumber(s.earned_today ?? 0)} icon={FaArrowUp} tone="success" compact />
                    <StatCard label="Bugün harcanan" value={formatNumber(s.spent_today ?? 0)} icon={FaArrowDown} tone="danger" compact />
                    <StatCard label="7 günde kazanılan" value={formatNumber(s.earned_7d ?? 0)} icon={FaCalendarWeek} tone="success" compact />
                    <StatCard label="7 günde harcanan" value={formatNumber(s.spent_7d ?? 0)} icon={FaCalendarDay} tone="danger" compact />
                </div>
            )}

            {!summary.error && (
                <div className="grid gap-4 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                    <Card title="En çok satanlar" subtitle="Satış adedine göre">
                        {summary.loading && !s ? <Skeleton className="h-40" /> : top.length ? (
                            <ol className="space-y-2" data-testid="coin-top-items">
                                {top.map((it, i) => (
                                    <li key={it.key ?? i} className="flex items-center gap-3 rounded-lg p-fill px-3 py-2">
                                        <span className="text-xs font-bold p-muted tabular-nums w-5 shrink-0">{i + 1}.</span>
                                        <ShopItemPreview itemKey={it.key} size={36} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium truncate">{it.name || designOf(it.key)?.name || it.key}</span>
                                            <span className="block text-[11px] p-muted truncate">{categoryLabel(it.category || designOf(it.key)?.category)}</span>
                                        </span>
                                        <span className="flex flex-col items-end gap-0.5 shrink-0">
                                            <Badge tone="accent">{formatNumber(it.sold_count ?? it.count ?? 0)} satış</Badge>
                                            {it.revenue !== undefined && it.revenue !== null && <span className="text-[10px] p-muted tabular-nums">{formatNumber(it.revenue)} jeton</span>}
                                        </span>
                                    </li>
                                ))}
                            </ol>
                        ) : <p className="text-xs p-muted py-6 text-center">Henüz satış yok.</p>}
                    </Card>

                    <Card title="Mesaj Bileti kullanım kaydı" subtitle="Son 50 bilet mesajı (kim → kime, ne zaman). İçerik moderasyon için görünür." padded={false}>
                        <div data-testid="coin-ticket-log">
                            <DataTable columns={logCols} rows={log} rowKey="_k" loading={summary.loading && !s} dense
                                empty={<p className="py-8 text-center text-xs p-muted"><FaTicketAlt className="inline mr-1" aria-hidden />Henüz bilet kullanılmadı.</p>} />
                        </div>
                    </Card>
                </div>
            )}
        </>
    );
}

/**
 * Jeton yönetimi (§F.7): özet, kullanıcı cüzdanı + işlem geçmişi ve
 * gerekçeli jeton ver/kes. Seçili kullanıcı URL'de (?user=) durur.
 */
export default function GameCoins() {
    const toast = useToast();
    const navigate = useNavigate();
    const goUser = (id) => navigate(`/cpl-manage/users/${id}`);
    const [params, setParams] = useSearchParams();
    const userId = params.get('user') || '';

    const summary = useQuery(() => gameAdminApi.shopSummary(), []);

    const [q, setQ] = useState('');
    const term = q.trim();
    const search = useQuery(() => gameAdminApi.searchWallets(term), [term], { enabled: term.length >= 2 });
    const results = term.length >= 2 ? listOf(search.data, 'results', 'wallets', 'users') : [];

    const [txPage, setTxPage] = useState(1);
    const walletQ = useQuery(() => gameAdminApi.wallet(userId, { page: txPage }), [userId, txPage], { enabled: !!userId });
    const w = userId ? walletQ.data : null;
    const wallet = w?.wallet || null;
    const user = w?.user || null;
    const { rows: txs, pagination: txPag } = pagedList(w, 'transactions');

    const [adjust, setAdjust] = useState(EMPTY_ADJUST);
    const [adjErrors, setAdjErrors] = useState({});
    const [confirm, setConfirm] = useState(null); // { userId, username, amount, mode, reason }
    const [busy, setBusy] = useState(false);
    const setA = (k, v) => { setAdjust((a) => ({ ...a, [k]: v })); setAdjErrors((e) => ({ ...e, [k]: undefined })); };

    const select = (id) => {
        setTxPage(1);
        setAdjust(EMPTY_ADJUST);
        setAdjErrors({});
        const next = new URLSearchParams(params);
        if (id) next.set('user', id); else next.delete('user');
        setParams(next, { replace: true });
    };

    const review = (e) => {
        e?.preventDefault?.();
        const errs = validateAdjust(adjust, wallet?.balance);
        setAdjErrors(errs);
        if (Object.keys(errs).length || !user) return;
        setConfirm({ userId, username: user.username, amount: toInt(adjust.amount), mode: adjust.mode, reason: adjust.reason.trim() });
    };

    const apply = async () => {
        if (!confirm || busy) return;
        setBusy(true);
        try {
            const r = await gameAdminApi.adjustWallet(confirm.userId, { amount: signedAmount(confirm.mode, confirm.amount), reason: confirm.reason });
            const body = r?.data?.data ?? {};
            toast.success(r?.data?.message || (confirm.mode === 'grant' ? 'Jeton verildi.' : 'Jeton kesildi.'));
            if (body.wallet && confirm.userId === userId) walletQ.setData((d) => (d ? { ...d, wallet: body.wallet } : d));
            setAdjust(EMPTY_ADJUST);
            setAdjErrors({});
            setConfirm(null);
            setTxPage(1);
            walletQ.refetch();
            summary.refetch();
        } catch (err) {
            const fe = fieldErrors(err) || {};
            if (err?.response?.data?.data?.reason === 'insufficient' || err?.response?.data?.reason === 'insufficient') fe.amount = fe.amount || 'Bakiye yetersiz: kesinti bakiyeyi negatife düşüremez.';
            setAdjErrors(fe);
            setConfirm(null);
            toast.error(errorMessage(err));
        } finally { setBusy(false); }
    };

    const txCols = [
        { key: 'created_at', label: 'Tarih', width: 140, nowrap: true, render: (t) => <span className="text-xs">{formatDateTime(t.created_at)}</span> },
        { key: 'type', label: 'Tür', width: 140, render: (t) => { const ty = txTypeOf(t.type); return <Badge size="xs" tone={ty.tone}>{ty.label}</Badge>; } },
        { key: 'amount', label: 'Miktar', width: 100, align: 'right', render: (t) => <Amount value={t.amount} /> },
        { key: 'balance_after', label: 'Bakiye', width: 100, align: 'right', render: (t) => <span className="tabular-nums">{formatNumber(t.balance_after ?? 0)}</span> },
        { key: 'detail', label: 'Ayrıntı', render: (t) => (
            <div className="min-w-[160px] text-xs">
                {t.item_key && <span className="block">{designOf(t.item_key)?.name || ''} <code className="p-muted">{t.item_key}</code></span>}
                {t.note && <span className="block break-words whitespace-pre-wrap">{String(t.note)}</span>}
                {t.admin?.username && <span className="block p-muted">Yönetici: @{t.admin.username}</span>}
                {!t.item_key && !t.note && !t.admin?.username && <span className="p-muted">—</span>}
            </div>
        ) },
    ];

    const amountN = toInt(adjust.amount);
    const preview = wallet && Number.isInteger(amountN) && amountN > 0 ? num(wallet.balance) + signedAmount(adjust.mode, amountN) : null;

    return (
        <div className="space-y-6">
            <div className="flex justify-end -mt-2"><Button size="sm" icon={FaSync} onClick={summary.refetch} loading={summary.loading}>Yenile</Button></div>

            <Summary summary={summary} onUser={goUser} />

            <Card title="Kullanıcı cüzdanı" subtitle="Kullanıcı adıyla arayın; bakiye, işlem geçmişi ve jeton ver/kes.">
                <div className="space-y-4">
                    <div className="relative max-w-md">
                        <SearchInput value={q} onChange={setQ} placeholder="Kullanıcı adı ara" />
                        {term.length >= 2 && (
                            <div className="mt-2 rounded-xl border border-[var(--p-border)] p-fill" data-testid="wallet-results">
                                {search.loading ? <p className="px-3 py-3 text-xs p-muted">Aranıyor…</p>
                                    : search.error ? <p className="px-3 py-3 text-xs p-tone-danger">{search.error}</p>
                                        : results.length ? (
                                            <ul className="divide-y divide-[var(--p-border)]">
                                                {results.map((r, i) => (
                                                    <li key={r.user?.id ?? i}>
                                                        <button type="button" onClick={() => { select(r.user?.id); setQ(''); }} disabled={!r.user?.id}
                                                            className="flex w-full items-center gap-2 px-3 py-2 text-left p-hover p-ring">
                                                            <Avatar user={r.user} size={28} />
                                                            <span className="text-sm font-medium truncate flex-1">@{r.user?.username || '?'}</span>
                                                            <Badge tone="warning">{formatNumber(r.wallet?.balance ?? 0)} jeton</Badge>
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="px-3 py-3 text-xs p-muted">Eşleşen kullanıcı yok.</p>}
                            </div>
                        )}
                        {term.length === 1 && <p className="mt-1 text-[11px] p-muted">En az 2 karakter yazın.</p>}
                    </div>

                    {!userId ? (
                        <p className="text-xs p-muted py-4 text-center">Bir kullanıcı seçin.</p>
                    ) : walletQ.loading && !w ? <Skeleton className="h-32" /> : walletQ.error && !w ? (
                        <ErrorState message={walletQ.error} onRetry={walletQ.refetch} />
                    ) : user && (
                        <div className="space-y-4" data-testid="wallet-card">
                            <div className="flex flex-wrap items-center gap-3">
                                <Avatar user={user} size={44} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-base font-semibold truncate">@{user.username}</p>
                                    <div className="flex flex-wrap gap-2 mt-0.5">
                                        <button type="button" onClick={() => goUser(user.id)} className="text-xs p-muted hover:text-[var(--p-text)] inline-flex items-center gap-1 p-ring rounded"><FaExternalLinkAlt aria-hidden /> Kullanıcı sayfası</button>
                                    </div>
                                </div>
                                <Button size="sm" variant="ghost" icon={FaTimes} onClick={() => select('')}>Kapat</Button>
                            </div>

                            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3" data-testid="wallet-stats">
                                <StatCard label="Güncel bakiye" value={formatNumber(wallet?.balance ?? 0)} icon={FaCoins} tone="warning" compact />
                                <StatCard label="Toplam kazanılan" value={formatNumber(wallet?.earned_total ?? 0)} icon={FaArrowUp} tone="success" compact />
                                <StatCard label="Toplam harcanan" value={formatNumber(wallet?.spent_total ?? 0)} icon={FaArrowDown} tone="danger" compact />
                            </div>

                            <form onSubmit={review} className="rounded-xl border border-[var(--p-border)] p-4 space-y-3" noValidate data-testid="wallet-adjust">
                                <div role="radiogroup" aria-label="İşlem" className="inline-flex rounded-xl p-1 p-fill border border-[var(--p-border)]">
                                    {[{ k: 'grant', label: 'Jeton ver', icon: FaPlus }, { k: 'deduct', label: 'Jeton kes', icon: FaMinus }].map(({ k, label, icon: Icon }) => (
                                        <button key={k} type="button" role="radio" aria-checked={adjust.mode === k} onClick={() => setA('mode', k)}
                                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 h-8 text-sm font-medium p-ring ${adjust.mode === k ? (k === 'grant' ? 'bg-emerald-500/20 p-tone-success' : 'bg-rose-500/20 p-tone-danger') : 'p-muted hover:text-[var(--p-text)]'}`}>
                                            <Icon className="text-xs" aria-hidden />{label}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                                    <Field label="Miktar *" error={adjErrors.amount} hint={preview !== null ? `Yeni bakiye: ${formatNumber(preview)}` : undefined}>
                                        <Input type="number" inputMode="numeric" min={1} max={LIMITS.adjust} step={1} value={adjust.amount} onChange={(e) => setA('amount', e.target.value)} aria-label="Miktar" />
                                    </Field>
                                    <Field label="Gerekçe *" error={adjErrors.reason} hint={`${adjust.reason.trim().length}/${LIMITS.reason} · Denetim kaydına yazılır.`}>
                                        <Textarea rows={2} value={adjust.reason} onChange={(e) => setA('reason', e.target.value)} maxLength={LIMITS.reason} aria-label="Gerekçe" />
                                    </Field>
                                </div>
                                <div className="flex justify-end">
                                    <Button type="submit" variant={adjust.mode === 'grant' ? 'success' : 'danger'} icon={adjust.mode === 'grant' ? FaPlus : FaMinus}>{adjust.mode === 'grant' ? 'Jeton ver' : 'Jeton kes'}</Button>
                                </div>
                            </form>

                            <div>
                                <h4 className="text-sm font-semibold mb-2">İşlem geçmişi</h4>
                                <div className="rounded-xl border border-[var(--p-border)]" data-testid="wallet-transactions">
                                    <DataTable columns={txCols} rows={txs} loading={walletQ.loading} error={walletQ.error} onRetry={walletQ.refetch} dense
                                        rowTone={(t) => (t.type === 'admin_deduct' ? 'danger' : undefined)}
                                        pagination={txPag ? toPagination(txPag, txs.length) : undefined} onPage={setTxPage}
                                        empty={<p className="py-8 text-center text-xs p-muted">İşlem yok.</p>} />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </Card>

            <ConfirmDialog open={!!confirm} onClose={() => !busy && setConfirm(null)} loading={busy} onConfirm={apply}
                title={confirm?.mode === 'deduct' ? 'Jeton kesilsin mi?' : 'Jeton verilsin mi?'}
                confirmLabel={confirm?.mode === 'deduct' ? 'Jeton kes' : 'Jeton ver'} danger={confirm?.mode === 'deduct'}
                message={confirm ? `@${confirm.username} kullanıcısın${confirm.mode === 'deduct' ? 'dan' : 'a'} ${formatNumber(confirm.amount)} jeton ${confirm.mode === 'deduct' ? 'kesilecek' : 'verilecek'}. Gerekçe: "${confirm.reason}". İşlem adınızla denetim kaydına yazılır.` : ''} />
        </div>
    );
}
