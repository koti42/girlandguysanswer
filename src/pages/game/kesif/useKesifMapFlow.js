import { useCallback, useRef, useState } from 'react';
import { kesifErrorText } from '../../../components/game/kesif/kesifUtils';
import { exportErrorText } from './kesifSessionUtils';

/*
 * İnşa modu harita akışı (Kaydet / Yayınla). Oturum kancası dışında tutulur (dosya boyutu);
 * oyun nesnesi ve istemci ref ile okunur, hiçbir şey çizmez: yalnızca `dialog` durumunu yönetir.
 *
 * dialog:
 *   null
 *   { kind:'login', why:'publish'|'save' }          misafir -> giriş çağrısı
 *   { kind:'error', text }                          dışa aktarma hatası
 *   { kind:'slots', payload, profile, wallet }      boş hak yok -> Harita Hakkı Al penceresi
 *   { kind:'map', payload }                         başlık / açıklama / görünürlük formu
 *   { kind:'done', map, published }                 başarı
 * payload = { map, meta, cover, existing:{id,title,description}|null, visibility:'private'|'public' }
 */

const safeCall = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

export default function useKesifMapFlow({ gameRef, apiRef, memberRef, mapMetaRef, setMapMeta }) {
    const [dialog, setDialog] = useState(null);
    const busyRef = useRef(false);

    /** Motordan haritayı ve kapağı toplar: { map, meta, cover } | { error }. */
    const collect = useCallback(async () => {
        const g = gameRef.current;
        if (!g || typeof g.exportMap !== 'function') return { error: 'Harita şu an dışa aktarılamıyor.' };
        let res;
        try {
            res = await g.exportMap();
        } catch (err) {
            const text = typeof err?.message === 'string' && err.message.length <= 220 ? err.message : '';
            return { error: text || exportErrorText(null) };
        }
        const map = res && typeof res === 'object' ? res.map || (res.chunks ? res : null) : null;
        if (!map || res?.ok === false) return { error: exportErrorText(res) };
        let cover = safeCall(() => g.screenshot?.());
        cover = typeof cover === 'string' && cover.indexOf('data:image/') === 0 ? cover : null;
        return { map, meta: res.meta && typeof res.meta === 'object' ? res.meta : {}, cover };
    }, [gameRef]);

    /** Boş hak denetimi: hak yoksa hak satın alma penceresi, varsa form. */
    const openForm = useCallback(
        async (payload) => {
            const api = apiRef.current;
            if (!payload.existing && api && typeof api.overview === 'function') {
                try {
                    const ov = await api.overview();
                    const free = Number(ov?.profile?.slots_free);
                    if (Number.isFinite(free) && free <= 0) {
                        setDialog({ kind: 'slots', payload, profile: ov.profile, wallet: ov.wallet || null });
                        return true;
                    }
                } catch {
                    // hak sayısı okunamadı: forma devam; gerçek denetim sunucuda (422 no_slot)
                }
            }
            setDialog({ kind: 'map', payload });
            return true;
        },
        [apiRef]
    );

    /** initialVisibility: 'public' (Haritayı yayınla) | 'private' (Haritayı kaydet). */
    const start = useCallback(
        async (initialVisibility = 'public') => {
            if (busyRef.current) return false;
            if (!memberRef.current) {
                setDialog({ kind: 'login', why: initialVisibility === 'public' ? 'publish' : 'save' });
                return false;
            }
            busyRef.current = true;
            try {
                const data = await collect();
                if (data.error) {
                    setDialog({ kind: 'error', text: data.error });
                    return false;
                }
                return await openForm({ ...data, existing: mapMetaRef.current || null, visibility: initialVisibility });
            } finally {
                busyRef.current = false;
            }
        },
        [collect, openForm, memberRef, mapMetaRef]
    );

    /** Kayıtlı haritayı sessizce günceller (form yok). Başarıda true. */
    const saveExisting = useCallback(async () => {
        const existing = mapMetaRef.current;
        const api = apiRef.current;
        if (!existing || !api) return false;
        if (busyRef.current) return false;
        busyRef.current = true;
        try {
            const data = await collect();
            if (data.error) {
                setDialog({ kind: 'error', text: data.error });
                return false;
            }
            const body = { data: data.map };
            if (data.cover) body.cover = data.cover;
            try {
                await api.updateMap(existing.id, body);
                return true;
            } catch (err) {
                setDialog({ kind: 'error', text: kesifErrorText(err, 'Harita kaydedilemedi.') });
                return false;
            }
        } finally {
            busyRef.current = false;
        }
    }, [collect, apiRef, mapMetaRef]);

    const close = useCallback(() => setDialog(null), []);

    /** Form başarıyla bitti: sonraki kayıtlar aynı haritayı günceller. */
    const done = useCallback(
        (map, { published, publishError } = {}) => {
            if (map?.id) setMapMeta({ id: map.id, title: map.title || '', description: map.description || '' });
            setDialog({ kind: 'done', map: map || null, published: Boolean(published), publishError: publishError || '' });
        },
        [setMapMeta]
    );

    /** Sunucu "hak yok" dedi (yarış ya da bayat sayaç): hak penceresine geç. */
    const noSlot = useCallback(async (payload) => {
        const api = apiRef.current;
        let profile = null;
        let wallet = null;
        if (api && typeof api.overview === 'function') {
            try {
                const ov = await api.overview();
                profile = ov?.profile || null;
                wallet = ov?.wallet || null;
            } catch {
                // sayaç okunamadı: pencere varsayılan fiyatla açılır
            }
        }
        setDialog({ kind: 'slots', payload, profile, wallet });
    }, [apiRef]);

    /** SlotShop her güncel sunucu verisinde: sayaç ve bakiye tazelenir. */
    const slotsChanged = useCallback(({ profile, wallet } = {}) => {
        setDialog((d) => (d && d.kind === 'slots' ? { ...d, profile: profile || d.profile, wallet: wallet || d.wallet } : d));
    }, []);

    /** Hak penceresi kapandı: hak açıldıysa forma, açılmadıysa kapat. */
    const slotsClosed = useCallback(() => {
        setDialog((d) => {
            if (!d || d.kind !== 'slots') return d;
            const free = Number(d.profile?.slots_free);
            return Number.isFinite(free) && free > 0 ? { kind: 'map', payload: d.payload } : null;
        });
    }, []);

    return { dialog, setDialog, close, start, saveExisting, done, noSlot, slotsChanged, slotsClosed };
}
