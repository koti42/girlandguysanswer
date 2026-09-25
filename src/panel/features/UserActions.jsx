import React, { useState } from 'react';
import { FaBan, FaExclamation, FaSnowflake, FaStickyNote, FaUnlock } from 'react-icons/fa';
import { modApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useToast } from '../hooks/useToast';
import { usePanelAuth } from '../auth/PanelAuthContext';
import { can } from '../lib/permissions';
import { userStatusOf } from '../lib/moderation';
import { Button, ReasonDialog, Modal, Textarea, Field } from '../ui';

/**
 * Bir kullanıcıya uygulanabilecek moderasyon işlemleri. Duruma göre ban /
 * ban kaldır, dondur / çöz gösterir; uyarı ve not her zaman. Yetki yoksa
 * (kendisi, üst rütbe) düğmeler görünmez - sunucu zaten reddeder.
 */
export default function UserActions({ user, onChanged, size = 'sm', compact = false }) {
    const toast = useToast();
    const { user: me } = usePanelAuth();
    const [dialog, setDialog] = useState(null); // 'ban' | 'freeze' | 'warn' | 'note'
    const [busy, setBusy] = useState(false);
    const [note, setNote] = useState('');

    if (!user || !can.sanction(me, user)) return null;
    const status = userStatusOf(user);

    const run = async (fn, okMsg) => {
        setBusy(true);
        try {
            const res = await fn();
            toast.success(okMsg || res.data?.message || 'İşlem uygulandı.');
            setDialog(null);
            onChanged?.(res.data?.data?.user ?? null);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`flex flex-wrap gap-2 ${compact ? '' : ''}`}>
            {status === 'banned'
                ? <Button size={size} variant="success" icon={FaUnlock} loading={busy} onClick={() => run(() => modApi.unban(user.id), 'Ban kaldırıldı.')}>Banı kaldır</Button>
                : <Button size={size} variant="danger" icon={FaBan} onClick={() => setDialog('ban')}>Banla</Button>}
            {status === 'frozen'
                ? <Button size={size} variant="success" icon={FaUnlock} loading={busy} onClick={() => run(() => modApi.unfreeze(user.id), 'Dondurma kaldırıldı.')}>Çöz</Button>
                : status !== 'banned' && <Button size={size} variant="warning" icon={FaSnowflake} onClick={() => setDialog('freeze')}>Dondur</Button>}
            <Button size={size} variant="secondary" icon={FaExclamation} onClick={() => setDialog('warn')}>Uyar</Button>
            <Button size={size} variant="ghost" icon={FaStickyNote} onClick={() => { setNote(''); setDialog('note'); }}>Not</Button>

            <ReasonDialog open={dialog === 'ban'} onClose={() => setDialog(null)} title={`@${user.username} banlansın mı?`} description="Kullanıcı sisteme giremez, tüm oturumları kapanır." submitLabel="Banla" danger withDuration loading={busy}
                onSubmit={({ reason, minutes }) => run(() => modApi.ban(user.id, { reason, minutes }), 'Kullanıcı banlandı.')} />
            <ReasonDialog open={dialog === 'freeze'} onClose={() => setDialog(null)} title={`@${user.username} dondurulsun mu?`} description="Okuyabilir ama içerik üretemez, mesaj atamaz." submitLabel="Dondur" withDuration loading={busy}
                onSubmit={({ reason, minutes }) => run(() => modApi.freeze(user.id, { reason, minutes }), 'Kullanıcı donduruldu.')} />
            <ReasonDialog open={dialog === 'warn'} onClose={() => setDialog(null)} title={`@${user.username} uyarılsın mı?`} description="Yaptırım yok; kullanıcıya mesaj gider ve geçmişe işlenir." submitLabel="Uyar" loading={busy}
                onSubmit={({ reason }) => run(() => modApi.warn(user.id, { reason }), 'Uyarı gönderildi.')} />
            <Modal open={dialog === 'note'} onClose={() => setDialog(null)} title="Moderatör notu" subtitle="Kullanıcıya görünmez; yalnızca panelde."
                footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Vazgeç</Button><Button variant="primary" disabled={note.trim().length < 2} loading={busy} onClick={() => run(() => modApi.note(user.id, { note: note.trim() }), 'Not eklendi.')}>Kaydet</Button></>}>
                <Field label="Not"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={2000} placeholder="Örn. Şikâyetlerin çoğu aynı kişiden geliyor, takip et." /></Field>
            </Modal>
        </div>
    );
}
