import React, { useState } from 'react';
import { FaFingerprint, FaPlus, FaTrash } from 'react-icons/fa';
import { passkeyApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useQuery } from '../hooks/useQuery';
import { useToast } from '../hooks/useToast';
import { usePanelAuth } from '../auth/PanelAuthContext';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, Skeleton } from '../ui';
import { isUserCancel, passkeySupported, registerPasskey } from '../lib/webauthn';
import { formatDateTime, relativeTime } from '../lib/format';

/** Hesap güvenliği: passkey listesi, ekleme, silme. İki panelde de aynı. */
export default function SecurityPage() {
    const toast = useToast();
    const { user, borrowedSession } = usePanelAuth();
    const list = useQuery(() => passkeyApi.list(), []);
    const items = list.data?.passkeys || [];
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(null);
    const supported = passkeySupported();

    const add = async () => {
        setBusy(true);
        try {
            await registerPasskey(passkeyApi, name.trim());
            toast.success('Passkey eklendi. Artık şifresiz giriş yapabilirsin.');
            setAdding(false); setName(''); list.refetch();
        } catch (e) {
            if (!isUserCancel(e)) toast.error(errorMessage(e));
        } finally { setBusy(false); }
    };

    const remove = async () => {
        setBusy(true);
        try { await passkeyApi.remove(confirm.id); toast.success('Passkey silindi.'); setConfirm(null); list.refetch(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
    };

    return (
        <div>
            <PageHeader title="Güvenlik" description={`@${user?.username} · giriş yöntemlerin`} actions={supported && <Button size="sm" variant="primary" icon={FaPlus} onClick={() => setAdding(true)}>Passkey ekle</Button>} />
            {borrowedSession && <p className="mb-4 text-xs rounded-xl bg-white/[0.05] border border-[var(--p-border)] px-4 py-3">Bu oturum ana siteden devralındı. Panelden çıkış yapmak ana site oturumunu kapatmaz.</p>}
            <Card title="Passkey'ler" subtitle="Parmak izi, yüz veya cihaz PIN'i ile şifresiz giriş. Her cihaz için ayrı kayıt." padded={false}>
                {!supported && <p className="p-5 text-sm p-muted">Bu tarayıcı passkey desteklemiyor.</p>}
                {list.loading ? <Skeleton className="h-24 m-5" /> : items.length === 0 ? (
                    <EmptyState icon={FaFingerprint} title="Henüz passkey yok" description="Ekleyince giriş ekranında 'Passkey ile giriş' tek dokunuşla açılır." action={supported && <Button size="sm" variant="primary" icon={FaPlus} onClick={() => setAdding(true)}>İlk passkey'i ekle</Button>} />
                ) : (
                    <ul className="divide-y divide-[var(--p-border)]">
                        {items.map((p) => (
                            <li key={p.id} className="flex items-center gap-4 px-5 py-4">
                                <span className="h-10 w-10 rounded-xl bg-white/[0.06] grid place-items-center p-accent-text"><FaFingerprint /></span>
                                <div className="min-w-0 flex-1">
                                    <div className="font-medium">{p.name}</div>
                                    <div className="text-xs p-muted">eklendi {formatDateTime(p.created_at)} · {p.last_used_at ? `son kullanım ${relativeTime(p.last_used_at)}` : 'hiç kullanılmadı'}</div>
                                </div>
                                {p.last_used_at && <Badge tone="success" size="xs">aktif</Badge>}
                                <Button size="xs" variant="danger" icon={FaTrash} onClick={() => setConfirm(p)}>Sil</Button>
                            </li>
                        ))}
                    </ul>
                )}
            </Card>

            <Modal open={adding} onClose={() => setAdding(false)} title="Passkey ekle" subtitle="Tarayıcı cihaz doğrulaması isteyecek." footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Vazgeç</Button><Button variant="primary" loading={busy} onClick={add} icon={FaFingerprint}>Oluştur</Button></>}>
                <Field label="Cihaz adı" hint="Boş bırakılırsa tarayıcıdan tahmin edilir"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. İş bilgisayarı" maxLength={80} /></Field>
            </Modal>
            <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title="Passkey silinsin mi?" message={`"${confirm?.name}" ile artık giriş yapılamaz. Parola ve Google girişi etkilenmez.`} confirmLabel="Sil" danger loading={busy} onConfirm={remove} />
        </div>
    );
}
