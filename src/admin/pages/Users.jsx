import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FaBan, FaCheckCircle, FaDownload, FaKey, FaSnowflake, FaTrash, FaUnlock, FaUserShield } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { usePagedQuery, useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Avatar, Badge, Button, Card, DataTable, Modal, PageHeader, ReasonDialog, SearchInput, Select, Field } from '../../panel/ui';
import { USER_STATUS, userStatusOf } from '../../panel/lib/moderation';
import { relativeTime } from '../../panel/lib/format';
import { emptySelection } from '../../panel/ui/selection';
import UserDrawer from './UserDrawer';

const STATUS_FILTERS = [
    { key: '', label: 'Tümü' }, { key: 'banned', label: 'Banlı' }, { key: 'frozen', label: 'Donuk' }, { key: 'online', label: 'Çevrimiçi' },
    { key: 'verified', label: 'Doğrulanmış' }, { key: 'bot', label: 'Bot' }, { key: 'deleting', label: 'Silinecek' }, { key: 'trashed', label: 'Silinmiş' },
];

function filtersToParams(f) {
    const p = { search: f.search, role: f.role, gender: f.gender, sort: f.sort };
    if (f.status === 'banned') p.banned = 'true';
    if (f.status === 'frozen') p.frozen = 'true';
    if (f.status === 'online') p.online = 'true';
    if (f.status === 'verified') p.verified = 'true';
    if (f.status === 'bot') p.bot = 'true';
    if (f.status === 'deleting') p.deleting = 'true';
    if (f.status === 'trashed') p.trashed = 'true';
    return p;
}

/** Kullanıcı yönetimi: filtreli tablo, toplu işlem, detay çekmecesi. */
export default function Users() {
    const toast = useToast();
    const navigate = useNavigate();
    const { id } = useParams();
    const [sp] = useSearchParams();
    const [filters, setFilters] = useState({ search: sp.get('search') || '', role: '', gender: '', sort: 'newest', status: sp.get('banned') ? 'banned' : sp.get('online') ? 'online' : '' });
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);
    const [selection, setSelection] = useState(emptySelection());
    const [bulk, setBulk] = useState(null); // {action}
    const [bulkRole, setBulkRole] = useState('');
    const [busy, setBusy] = useState(false);

    const roles = useQuery(() => adminApi.roles(), []);
    const list = usePagedQuery(() => adminApi.users({ ...filtersToParams(filters), page, per_page: perPage }), [filters, page, perPage]);
    useEffect(() => { setPage(1); setSelection(emptySelection()); }, [filters, perPage]);

    const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }));

    const runBulk = async (extra = {}) => {
        setBusy(true);
        try {
            const res = await adminApi.bulkUsers({ ids: [...selection], action: bulk.action, role_slug: bulkRole || undefined, ...extra });
            toast.success(res.data?.message);
            if (res.data?.data?.failed?.length) toast.warning(`${res.data.data.failed.length} kullanıcı atlandı: ${res.data.data.failed.map((f) => f.username).join(', ')}`);
            setBulk(null); setSelection(emptySelection()); list.refetch();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const columns = useMemo(() => [
        { key: 'username', label: 'Kullanıcı', render: (u) => (
            <span className="inline-flex items-center gap-3 min-w-0"><Avatar user={u} size={32} /><span className="min-w-0"><span className="font-medium flex items-center gap-1.5">{u.username}{u.is_verified && <FaCheckCircle className="text-sky-400 text-xs" title="Doğrulanmış" />}{u.is_bot && <Badge size="xs">bot</Badge>}</span><span className="block text-xs p-muted truncate">{u.email}</span></span></span>
        ) },
        { key: 'roles', label: 'Roller', render: (u) => <span className="flex gap-1 flex-wrap">{(u.roles || []).filter((r) => r.slug !== 'user').map((r) => <Badge key={r.slug} tone={r.slug === 'super_admin' ? 'accent' : r.slug === 'admin' ? 'info' : r.slug === 'moderator' ? 'warning' : 'neutral'} size="xs">{r.name || r.slug}</Badge>)}</span> },
        { key: 'status', label: 'Durum', width: 130, render: (u) => { const s = userStatusOf(u); return <span className="flex gap-1 flex-wrap"><Badge tone={USER_STATUS[s].tone} dot>{USER_STATUS[s].label}</Badge>{u.pending_reports > 0 && <Badge tone="danger" size="xs">{u.pending_reports} şikâyet</Badge>}</span>; } },
        { key: 'last_seen_at', label: 'Son görülme', width: 120, nowrap: true, render: (u) => <span className="text-xs p-muted">{u.last_seen_at ? relativeTime(u.last_seen_at) : '—'}</span> },
        { key: 'created_at', label: 'Kayıt', width: 110, nowrap: true, render: (u) => <span className="text-xs p-muted">{relativeTime(u.created_at)}</span> },
    ], []);

    const bulkLabel = { ban: 'Banla', unban: 'Banı kaldır', freeze: 'Dondur', unfreeze: 'Çöz', verify: 'Doğrula', unverify: 'Doğrulamayı kaldır', revoke_tokens: 'Oturumları kapat', add_role: 'Rol ekle', remove_role: 'Rol kaldır', delete: 'Sil' };

    return (
        <div>
            <PageHeader title="Kullanıcılar" description={`${list.pagination.total || 0} kayıt`} actions={<Button size="sm" icon={FaDownload} onClick={() => downloadCsv('users', toast)}>CSV</Button>}>
                <div className="flex flex-wrap items-center gap-2">
                    <SearchInput value={filters.search} onChange={set('search')} placeholder="Kullanıcı adı veya e-posta" className="w-full sm:w-72" autoFocus={sp.get('focus') === '1'} />
                    <Select value={filters.status} onChange={(e) => set('status')(e.target.value)} className="w-auto" aria-label="Durum">{STATUS_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>
                    <Select value={filters.role} onChange={(e) => set('role')(e.target.value)} className="w-auto" aria-label="Rol"><option value="">Tüm roller</option>{(roles.data?.roles || roles.data || []).map?.((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</Select>
                    <Select value={filters.gender} onChange={(e) => set('gender')(e.target.value)} className="w-auto" aria-label="Cinsiyet"><option value="">Cinsiyet</option><option value="female">Kadın</option><option value="male">Erkek</option></Select>
                    <Select value={filters.sort} onChange={(e) => set('sort')(e.target.value)} className="w-auto" aria-label="Sıralama"><option value="newest">En yeni</option><option value="oldest">En eski</option><option value="last_seen">Son görülme</option><option value="reported">Çok şikâyetli</option><option value="username">Ad</option></Select>
                </div>
                {selection.size > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/[0.05] border border-[var(--p-border)] px-3 py-2 text-xs">
                        <b className="mr-1">{selection.size} seçili</b>
                        <Button size="xs" variant="danger" icon={FaBan} onClick={() => setBulk({ action: 'ban' })}>Banla</Button>
                        <Button size="xs" variant="success" icon={FaUnlock} onClick={() => setBulk({ action: 'unban' })}>Banı kaldır</Button>
                        <Button size="xs" variant="warning" icon={FaSnowflake} onClick={() => setBulk({ action: 'freeze' })}>Dondur</Button>
                        <Button size="xs" variant="secondary" onClick={() => setBulk({ action: 'unfreeze' })}>Çöz</Button>
                        <Button size="xs" variant="secondary" icon={FaCheckCircle} onClick={() => setBulk({ action: 'verify' })}>Doğrula</Button>
                        <Button size="xs" variant="secondary" icon={FaKey} onClick={() => setBulk({ action: 'revoke_tokens' })}>Oturumları kapat</Button>
                        <Button size="xs" variant="secondary" icon={FaUserShield} onClick={() => setBulk({ action: 'add_role' })}>Rol ekle</Button>
                        <Button size="xs" variant="ghost" onClick={() => setBulk({ action: 'remove_role' })}>Rol kaldır</Button>
                        <Button size="xs" variant="danger" icon={FaTrash} onClick={() => setBulk({ action: 'delete' })}>Sil</Button>
                        <button type="button" className="ml-auto p-muted hover:text-[var(--p-text)]" onClick={() => setSelection(emptySelection())}>Temizle</button>
                    </div>
                )}
            </PageHeader>

            <Card padded={false}>
                <DataTable columns={columns} rows={list.items} loading={list.loading} error={list.error} onRetry={list.refetch}
                    selectable selection={selection} onSelectionChange={setSelection}
                    onRowClick={(u) => navigate(`/cpl-manage/users/${u.id}`)}
                    rowTone={(u) => userStatusOf(u) === 'banned' ? 'danger' : u.pending_reports >= 3 ? 'warning' : u.deleted_at ? 'muted' : undefined}
                    pagination={list.pagination} onPage={setPage} perPage={perPage} onPerPage={setPerPage} />
            </Card>

            <UserDrawer id={id} onClose={() => navigate('/cpl-manage/users')} onChanged={() => list.refetch()} roles={roles.data?.roles || roles.data || []} />

            {/* Toplu işlem diyalogları */}
            <ReasonDialog open={!!bulk && ['ban', 'freeze', 'delete'].includes(bulk.action)} onClose={() => setBulk(null)} title={`${selection.size} kullanıcı: ${bulkLabel[bulk?.action]}`} description={bulk?.action === 'delete' ? 'Hesaplar yumuşak silinir, geri getirilebilir.' : undefined} submitLabel={bulkLabel[bulk?.action]} danger withDuration={bulk?.action !== 'delete'} loading={busy}
                onSubmit={({ reason, minutes }) => runBulk({ reason, minutes: minutes ?? undefined })} />
            <Modal open={!!bulk && !['ban', 'freeze', 'delete'].includes(bulk.action)} onClose={() => setBulk(null)} title={`${selection.size} kullanıcı: ${bulkLabel[bulk?.action]}`}
                footer={<><Button variant="ghost" onClick={() => setBulk(null)}>Vazgeç</Button><Button variant="primary" loading={busy} disabled={['add_role', 'remove_role'].includes(bulk?.action) && !bulkRole} onClick={() => runBulk()}>Uygula</Button></>}>
                {['add_role', 'remove_role'].includes(bulk?.action) ? (
                    <Field label="Rol"><Select value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}><option value="">Seçin</option>{(roles.data?.roles || roles.data || []).map?.((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</Select></Field>
                ) : <p className="text-sm">Seçili kullanıcılara <b>{bulkLabel[bulk?.action]}</b> uygulanacak.</p>}
            </Modal>
        </div>
    );
}

async function downloadCsv(type, toast) {
    try {
        const res = await adminApi.export(type);
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url; a.download = `${type}.csv`; a.click();
        URL.revokeObjectURL(url);
    } catch (e) { toast.error(errorMessage(e)); }
}
