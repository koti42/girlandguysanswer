import React, { useState } from 'react';
import { FaEye, FaEyeSlash, FaTrash, FaTrashRestore } from 'react-icons/fa';
import { modApi } from '../api/endpoints';
import { errorMessage } from '../api/client';
import { useToast } from '../hooks/useToast';
import { usePanelAuth } from '../auth/PanelAuthContext';
import { canDo, limitFor } from '../lib/permissions';
import { Button, ReasonDialog } from '../ui';
import { MOD_DATA_CHANGED, emit } from '../lib/events';

/** Tek içerik için gizle/göster/kaldır/geri al. `item.is_hidden`, `item.is_removed` bekler. */
export default function ContentActions({ type, item, onChanged, size = 'xs' }) {
    const toast = useToast();
    const { user: me } = usePanelAuth();
    const [dialog, setDialog] = useState(null);
    const [busy, setBusy] = useState(false);

    if (!item) return null;
    // Kademeli moderasyon: seviyenin kapsamadığı düğme görünmez (asıl kapı sunucuda).
    const allowed = (cap) => canDo(me, cap);
    const hideMax = limitFor(me, 'hide');

    const run = async (fn, ok) => {
        setBusy(true);
        try {
            const res = await fn();
            toast.success(ok || res.data?.message);
            setDialog(null);
            emit(MOD_DATA_CHANGED);
            onChanged?.(res.data?.data?.content ?? null);
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
            {item.is_removed ? (
                allowed('restore') && <Button size={size} variant="success" icon={FaTrashRestore} loading={busy} onClick={() => run(() => modApi.restore(type, item.id, {}), 'Geri getirildi.')}>Geri getir</Button>
            ) : (
                <>
                    {item.is_hidden
                        ? allowed('unhide') && <Button size={size} variant="success" icon={FaEye} loading={busy} onClick={() => run(() => modApi.unhide(type, item.id, {}), 'Görünür yapıldı.')}>Göster</Button>
                        : allowed('hide') && <Button size={size} variant="warning" icon={FaEyeSlash} onClick={() => setDialog('hide')}>Gizle</Button>}
                    {allowed('remove') && <Button size={size} variant="danger" icon={FaTrash} onClick={() => setDialog('remove')}>Kaldır</Button>}
                </>
            )}
            <ReasonDialog open={dialog === 'hide'} onClose={() => setDialog(null)} title="İçerik gizlensin mi?" description="Herkese açık listelerden düşer; süre dolunca kendiliğinden geri gelir." submitLabel="Gizle" withDuration maxMinutes={hideMax === false ? null : hideMax} loading={busy}
                onSubmit={({ reason, minutes }) => run(() => modApi.hide(type, item.id, { reason, minutes }), 'İçerik gizlendi.')} />
            <ReasonDialog open={dialog === 'remove'} onClose={() => setDialog(null)} title="İçerik kaldırılsın mı?" description="Yumuşak silme; geri getirilebilir. Sahibine puan cezası uygulanır." submitLabel="Kaldır" danger loading={busy}
                onSubmit={({ reason }) => run(() => modApi.remove(type, item.id, { reason }), 'İçerik kaldırıldı.')} />
        </div>
    );
}
