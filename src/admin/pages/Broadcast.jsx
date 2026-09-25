import React, { useEffect, useState } from 'react';
import { FaBullhorn, FaUsers } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { Button, Card, ConfirmDialog, Field, Input, PageHeader, Select, Switch, Textarea } from '../../panel/ui';

/** Toplu duyuru: önce kesit ve kişi sayısı, sonra onayla gönder. */
export default function Broadcast() {
    const toast = useToast();
    const roles = useQuery(() => adminApi.roles(), []);
    const [filters, setFilters] = useState({ role: '', gender: '', active_days: '', verified: '' });
    const [msg, setMsg] = useState({ title: '', body: '', url: '', push: false });
    const [count, setCount] = useState(null);
    const [confirm, setConfirm] = useState(false);
    const [busy, setBusy] = useState(false);

    const cleanFilters = () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '').map(([k, v]) => [k, k === 'active_days' ? Number(v) : k === 'verified' ? v === 'true' : v]));

    useEffect(() => {
        let alive = true;
        setCount(null);
        adminApi.broadcastPreview(cleanFilters()).then((r) => { if (alive) setCount(r.data.data.count); }).catch(() => { if (alive) setCount(null); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.role, filters.gender, filters.active_days, filters.verified]);

    const send = async () => {
        setBusy(true);
        try {
            const r = await adminApi.broadcast({ ...cleanFilters(), ...msg, url: msg.url || undefined });
            toast.success(r.data?.message);
            setConfirm(false); setMsg({ title: '', body: '', url: '', push: false });
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    const ready = msg.title.trim().length >= 3 && msg.body.trim().length >= 5 && count > 0;

    return (
        <div>
            <PageHeader title="Duyuru" description="Seçilen kullanıcılara uygulama içi bildirim (ve isteğe bağlı push) gönderir. Banlı ve bot hesaplara gitmez." />
            <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <Card title="Kime" subtitle="Filtreler birlikte uygulanır (VE)">
                    <div className="space-y-3">
                        <Field label="Rol"><Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}><option value="">Herkes</option>{(roles.data?.roles || roles.data || []).map?.((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}</Select></Field>
                        <Field label="Cinsiyet"><Select value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">Hepsi</option><option value="female">Kadın</option><option value="male">Erkek</option></Select></Field>
                        <Field label="Son X günde aktif" hint="Boş = tümü"><Input type="number" min={1} max={365} value={filters.active_days} onChange={(e) => setFilters({ ...filters, active_days: e.target.value })} /></Field>
                        <Field label="Doğrulama"><Select value={filters.verified} onChange={(e) => setFilters({ ...filters, verified: e.target.value })}><option value="">Fark etmez</option><option value="true">Doğrulanmış</option><option value="false">Doğrulanmamış</option></Select></Field>
                        <div className="rounded-xl p-accent-bg p-4 flex items-center gap-3"><FaUsers className="text-xl" /><div><div className="text-2xl font-bold tabular-nums">{count === null ? '…' : count.toLocaleString('tr-TR')}</div><div className="text-xs opacity-80">kullanıcıya gidecek</div></div></div>
                    </div>
                </Card>
                <Card title="Mesaj">
                    <div className="space-y-3">
                        <Field label="Başlık *"><Input maxLength={120} value={msg.title} onChange={(e) => setMsg({ ...msg, title: e.target.value })} placeholder="Örn. Yeni özellik: Hikâyeler" /></Field>
                        <Field label="Metin *"><Textarea rows={5} maxLength={1000} value={msg.body} onChange={(e) => setMsg({ ...msg, body: e.target.value })} /></Field>
                        <Field label="Bağlantı" hint="Bildirime tıklanınca açılır (isteğe bağlı)"><Input value={msg.url} onChange={(e) => setMsg({ ...msg, url: e.target.value })} placeholder="/stories" /></Field>
                        <Switch checked={msg.push} onChange={(v) => setMsg({ ...msg, push: v })} label="Push bildirimi de gönder" description="Mobil cihazlara FCM ile gider; büyük kesitlerde uzun sürebilir." />
                        <div className="rounded-xl border border-[var(--p-border)] p-4">
                            <div className="text-[10px] uppercase p-muted mb-1">Önizleme</div>
                            <div className="font-semibold">{msg.title || 'Başlık'}</div>
                            <div className="text-sm p-muted whitespace-pre-wrap">{msg.body || 'Metin…'}</div>
                        </div>
                        <Button variant="primary" icon={FaBullhorn} disabled={!ready} onClick={() => setConfirm(true)}>Gönder</Button>
                    </div>
                </Card>
            </div>
            <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="Duyuru gönderilsin mi?" message={`"${msg.title}" ${count?.toLocaleString('tr-TR')} kullanıcıya gönderilecek. Geri alınamaz.`} confirmLabel="Gönder" loading={busy} onConfirm={send} confirmText={count > 1000 ? 'GÖNDER' : null} />
        </div>
    );
}
