import React, { useEffect, useState } from 'react';
import { FaCheckCircle, FaKey, FaPaperPlane, FaSave, FaTrash, FaTrashRestore } from 'react-icons/fa';
import { adminApi } from '../../panel/api/endpoints';
import { errorMessage } from '../../panel/api/client';
import { useQuery } from '../../panel/hooks/useQuery';
import { useToast } from '../../panel/hooks/useToast';
import { usePanelAuth } from '../../panel/auth/PanelAuthContext';
import { Avatar, Badge, Button, ConfirmDialog, Drawer, Field, Input, Modal, Select, Skeleton, Tabs, Textarea, Timeline } from '../../panel/ui';
import { USER_STATUS, userStatusOf } from '../../panel/lib/moderation';
import { formatDateTime, formatNumber, relativeTime } from '../../panel/lib/format';
import UserActions from '../../panel/features/UserActions';
import ContentBrowser from '../../panel/features/ContentBrowser';

/**
 * Kullanıcı detay çekmecesi: profil düzenleme, roller, içerik, moderasyon
 * geçmişi, mesajlar ve oturumlar. URL /cpl-manage/users/:id ile açılır.
 */
export default function UserDrawer({ id, onClose, onChanged, roles = [] }) {
    const toast = useToast();
    const { isSuperAdmin, user: me } = usePanelAuth();
    const [tab, setTab] = useState('profile');
    const q = useQuery(() => adminApi.user(id), [id], { enabled: !!id });
    const user = q.data?.user;
    const [form, setForm] = useState({});
    const [roleSlugs, setRoleSlugs] = useState([]);
    const [featureTag, setFeatureTag] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const [dm, setDm] = useState(null); // null | metin: yöneticiden kullanıcıya özel mesaj
    const tags = useQuery(() => adminApi.catalog('feature-tags'), [], { enabled: !!id });

    const sendDm = async () => {
        setBusy(true);
        try {
            await adminApi.sendMessage({ receiver_id: user.id, content: dm.trim(), type: 'text' });
            toast.success('Mesaj gönderildi.');
            setDm(null);
        } catch (e) { toast.error(errorMessage(e)); }
        finally { setBusy(false); }
    };

    useEffect(() => {
        if (!user) return;
        setForm({ username: user.username || '', email: user.email || '', gender: user.gender || '' });
        setRoleSlugs((user.roles || []).map((r) => r.slug));
        setFeatureTag(user.feature_tag?.slug || '');
    }, [user]);
    useEffect(() => { setTab('profile'); }, [id]);

    const refresh = () => { q.refetch(); onChanged?.(); };
    const run = async (fn, ok) => {
        setBusy(true);
        try { const r = await fn(); toast.success(ok || r.data?.message); setConfirm(null); refresh(); }
        catch (e) { toast.error(errorMessage(e)); }
        finally { setBusy(false); }
    };

    const dirty = user && (form.username !== user.username || form.email !== user.email || form.gender !== (user.gender || ''));
    const rolesDirty = user && JSON.stringify([...roleSlugs].sort()) !== JSON.stringify((user.roles || []).map((r) => r.slug).sort());
    const tagDirty = user && featureTag !== (user.feature_tag?.slug || '');
    const status = userStatusOf(user);

    return (
        <Drawer open={!!id} onClose={onClose} width="max-w-3xl"
            title={user ? <span className="inline-flex items-center gap-3"><Avatar user={user} size={36} />@{user.username}{user.is_verified && <FaCheckCircle className="p-tone-info text-sm" />}<Badge tone={USER_STATUS[status].tone} dot>{USER_STATUS[status].label}</Badge></span> : 'Kullanıcı'}
            subtitle={user && `${user.email} · kayıt ${formatDateTime(user.created_at)} · son görülme ${user.last_seen_at ? relativeTime(user.last_seen_at) : '—'}`}
            footer={user && (
                <>
                    <UserActions user={user} onChanged={refresh} />
                    <div className="ml-auto flex gap-2">
                        {me?.id !== user.id && !user.is_bot && <Button size="sm" variant="secondary" icon={FaPaperPlane} onClick={() => setDm('')}>Mesaj gönder</Button>}
                        {user.deleted_at
                            ? <Button size="sm" variant="success" icon={FaTrashRestore} loading={busy} onClick={() => run(() => adminApi.restoreUser(user.id), 'Hesap geri getirildi.')}>Geri getir</Button>
                            : me?.id !== user.id && <Button size="sm" variant="danger" icon={FaTrash} onClick={() => setConfirm('delete')}>Hesabı sil</Button>}
                    </div>
                </>
            )}>
            {q.loading && <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-40" /></div>}
            {user && (
                <div className="space-y-5">
                    {q.data.counts && (
                        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                            {[['Soru', q.data.counts.questions], ['Cevap', q.data.counts.answers], ['Yorum', q.data.counts.comments], ['Görüş', q.data.counts.opinions], ['Hikâye', q.data.counts.stories], ['Şikâyet', q.data.counts.complaints_against]].map(([k, v]) => (
                                <div key={k} className="rounded-lg p-fill py-2"><dt className="text-[10px] uppercase p-muted">{k}</dt><dd className="font-bold text-sm">{formatNumber(v)}</dd></div>
                            ))}
                        </dl>
                    )}
                    {(user.banned_reason || user.frozen_reason) && (
                        <p className="text-xs rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">{user.banned_reason ? `Ban sebebi: ${user.banned_reason}` : `Dondurma sebebi: ${user.frozen_reason}`}{(user.banned_until || user.frozen_until) && ` · bitiş ${formatDateTime(user.banned_until || user.frozen_until)}`}</p>
                    )}

                    <Tabs items={[{ key: 'profile', label: 'Profil' }, { key: 'content', label: 'İçerik' }, { key: 'history', label: 'Geçmiş', count: q.data.history?.length }, { key: 'messages', label: 'Mesajlar' }, { key: 'sessions', label: 'Oturumlar', count: q.data.counts?.active_sessions }]} value={tab} onChange={setTab} />

                    {tab === 'profile' && (
                        <div className="space-y-5">
                            <section className="grid gap-3 sm:grid-cols-3">
                                <Field label="Kullanıcı adı"><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
                                <Field label="E-posta"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
                                <Field label="Cinsiyet"><Select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="">Belirsiz</option><option value="female">Kadın</option><option value="male">Erkek</option></Select></Field>
                                <div className="sm:col-span-3 flex flex-wrap gap-2">
                                    <Button size="sm" variant="primary" icon={FaSave} disabled={!dirty} loading={busy} onClick={() => run(() => adminApi.updateUser(user.id, { username: form.username, email: form.email, gender: form.gender || null }), 'Profil güncellendi.')}>Kaydet</Button>
                                    {user.is_verified
                                        ? <Button size="sm" variant="ghost" onClick={() => run(() => adminApi.unverify(user.id), 'Doğrulama kaldırıldı.')}>Doğrulamayı kaldır</Button>
                                        : <Button size="sm" variant="secondary" icon={FaCheckCircle} onClick={() => run(() => adminApi.verify(user.id), 'Hesap doğrulandı.')}>Doğrula</Button>}
                                </div>
                            </section>

                            <section>
                                <h4 className="text-xs font-semibold p-muted mb-2">Roller</h4>
                                <div className="flex flex-wrap gap-2">
                                    {roles.map((r) => {
                                        const on = roleSlugs.includes(r.slug);
                                        const locked = r.slug === 'super_admin' && !isSuperAdmin;
                                        return <button key={r.slug} type="button" disabled={locked} onClick={() => setRoleSlugs((s) => on ? s.filter((x) => x !== r.slug) : [...s, r.slug])} className={`text-xs rounded-full border px-3 py-1.5 transition-colors p-ring disabled:opacity-40 ${on ? 'p-accent-bg border-transparent' : 'border-[var(--p-border)] p-hover'}`} title={locked ? 'Yalnızca süper admin' : r.description}>{r.name}</button>;
                                    })}
                                    <Button size="sm" variant="primary" disabled={!rolesDirty} loading={busy} onClick={() => run(() => adminApi.updateRoles(user.id, roleSlugs), 'Roller güncellendi.')}>Rolleri kaydet</Button>
                                </div>
                            </section>

                            <section className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                                <Field label="Fenomen etiketi"><Select value={featureTag} onChange={(e) => setFeatureTag(e.target.value)}><option value="">Yok</option>{(tags.data?.items || []).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}</Select></Field>
                                <Button size="md" disabled={!tagDirty} loading={busy} onClick={() => run(() => adminApi.updateFeatureTag(user.id, featureTag || null), 'Etiket güncellendi.')}>Etiketi kaydet</Button>
                            </section>

                            {user.detail && (
                                <section className="text-xs p-muted grid sm:grid-cols-2 gap-1">
                                    <div>Bio: <span className="text-[var(--p-text)]">{user.detail.bio || '—'}</span></div>
                                    <div>Gizli profil: <b>{user.detail.is_private ? 'evet' : 'hayır'}</b> · Mesaj: <b>{user.detail.messaging_mode}</b></div>
                                    <div>Takipçi {user.detail.followers_count} · Takip {user.detail.following_count}</div>
                                    <div>XP: <b>{q.data.user.gamification_stat?.current_xp ?? 0}</b> · Seviye: <b>{q.data.user.gamification_stat?.level?.name || '—'}</b></div>
                                </section>
                            )}
                        </div>
                    )}

                    {tab === 'content' && <ContentBrowser userId={user.id} />}
                    {tab === 'history' && <Timeline items={q.data.history || []} showTarget={false} />}
                    {tab === 'messages' && <Messages userId={user.id} />}
                    {tab === 'sessions' && (
                        <div className="space-y-3">
                            <p className="text-sm">Aktif oturum: <b>{q.data.counts?.active_sessions ?? 0}</b></p>
                            <Button size="sm" variant="warning" icon={FaKey} loading={busy} onClick={() => run(() => adminApi.revokeTokens(user.id, {}), 'Tüm oturumlar kapatıldı.')}>Tüm oturumları kapat</Button>
                            <p className="text-xs p-muted">Kullanıcı her cihazda çıkış yapmış olur; parola değişmez.</p>
                        </div>
                    )}
                </div>
            )}

            <ConfirmDialog open={confirm === 'delete'} onClose={() => setConfirm(null)} title="Hesap silinsin mi?" message={`@${user?.username} hesabı yumuşak silinir; içerikleri gizlenmez ama profil erişilemez olur. Geri getirilebilir.`} confirmLabel="Sil" danger confirmText={user?.username} loading={busy}
                onConfirm={() => run(() => adminApi.deleteUser(user.id, { reason: 'Yönetici sildi' }), 'Hesap silindi.')} />
                    <Modal open={dm !== null} onClose={() => setDm(null)} title={`@${user?.username} kişisine mesaj`} subtitle="Kendi hesabınızdan gider. Kullanıcının mesaj kutusu kapalı ya da sizi engellemiş olsa da ulaşır."
                footer={<><Button variant="ghost" onClick={() => setDm(null)}>Vazgeç</Button><Button variant="primary" icon={FaPaperPlane} disabled={!dm || dm.trim().length < 2} loading={busy} onClick={sendDm}>Gönder</Button></>}>
                <Field label="Mesaj"><Textarea value={dm || ''} onChange={(e) => setDm(e.target.value)} rows={5} maxLength={5000} placeholder="Merhaba, hesabınızla ilgili…" /></Field>
            </Modal>
</Drawer>
    );
}

function Messages({ userId }) {
    const convs = useQuery(() => adminApi.userConversations(userId, { per_page: 20 }), [userId]);
    const [open, setOpen] = useState(null);
    const msgs = useQuery(() => adminApi.conversationMessages(open, { per_page: 50 }), [open], { enabled: !!open });
    const list = convs.data?.conversations || convs.data?.items || [];
    return (
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
            <ul className="space-y-1 max-h-96 overflow-y-auto">
                {convs.loading && <Skeleton className="h-24" />}
                {!convs.loading && !list.length && <li className="text-xs p-muted">Konuşma yok.</li>}
                {list.map((c) => <li key={c.id}><button type="button" onClick={() => setOpen(c.id)} className={`w-full text-left text-xs rounded-lg px-3 py-2 ${open === c.id ? 'p-fill' : 'p-hover'}`}>{c.other_user?.username || c.participants?.map((p) => p.username).join(', ') || c.id}<span className="block p-muted">{relativeTime(c.updated_at || c.last_message_at)}</span></button></li>)}
            </ul>
            <div className="max-h-96 overflow-y-auto space-y-2 text-sm">
                {!open && <p className="text-xs p-muted">Bir konuşma seçin.</p>}
                {open && msgs.loading && <Skeleton className="h-24" />}
                {open && !msgs.loading && (msgs.data?.messages || msgs.data?.items || []).map((m) => <div key={m.id} className={`rounded-lg px-3 py-2 ${m.sender_id === userId ? 'bg-[var(--p-accent)]/15 ml-8' : 'p-fill mr-8'}`}><div className="text-[10px] p-muted mb-0.5">{m.sender?.username || m.sender_id} · {relativeTime(m.created_at)}</div>{m.content || <i className="p-muted">[dosya/medya]</i>}</div>)}
            </div>
        </div>
    );
}
