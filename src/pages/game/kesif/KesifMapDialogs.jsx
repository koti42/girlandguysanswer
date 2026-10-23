import React, { useRef, useState } from 'react';
import { LuCheck, LuGlobe, LuLock, LuMap, LuSave, LuTriangleAlert } from 'react-icons/lu';
import SlotShop from '../../../components/game/kesif/SlotShop';
import { DESC_MAX, TITLE_MAX, TITLE_MIN, classifyKesifError, kesifErrorText } from '../../../components/game/kesif/kesifUtils';
import { freshKey } from '../../../services/kesifApiFactory';
import { LoginPrompt, Modal } from './KesifOverlays';

/*
 * İnşa modu pencereleri: harita formu (başlık, açıklama, görünürlük), hak satın alma, giriş çağrısı,
 * sonuç ve hata. Durum useKesifMapFlow'dadır; burada yalnızca çizim ve gönderim vardır.
 * Gönderim: var olan harita updateMap, yenisi createMap (hak yoksa 422 no_slot -> hak penceresi);
 * "Herkese açık" seçiliyse ardından publish. Başlık/açıklama sunucuda süzülür (text_blocked).
 */

const SaveMapForm = ({ payload, api, onClose, onDone, onNoSlot }) => {
    const existing = payload.existing;
    const [title, setTitle] = useState(existing?.title || (typeof payload.meta?.title === 'string' ? payload.meta.title : '') || '');
    const [desc, setDesc] = useState(existing?.description || (typeof payload.meta?.desc === 'string' ? payload.meta.desc : '') || '');
    const [visibility, setVisibility] = useState(payload.visibility === 'public' ? 'public' : 'private');
    const [agree, setAgree] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState({ field: null, text: '' });
    const lock = useRef(false);
    // Belirsiz sonuçlu (ağ/5xx) bir createMap'ten sonra aynı içerikle yeniden denemek aynı Idempotency-Key'i kullanır:
    // sunucu yavaş yanıtlasa bile ikinci bir harita (ve hak) oluşmaz.
    const retryKey = useRef(null);

    const trimmed = title.trim();
    const titleOk = trimmed.length >= TITLE_MIN && trimmed.length <= TITLE_MAX;
    const publishing = visibility === 'public';
    const canSubmit = titleOk && (!publishing || agree) && !busy;
    const errFor = (f) => (error.field === f ? error.text : '');

    const submit = async (e) => {
        e.preventDefault();
        if (lock.current) return;
        if (!titleOk) {
            setError({ field: 'title', text: `Başlık ${TITLE_MIN}-${TITLE_MAX} karakter olmalı.` });
            return;
        }
        if (publishing && !agree) {
            setError({ field: 'agree', text: 'Yayınlamak için onay kutusunu işaretle.' });
            return;
        }
        lock.current = true;
        setBusy(true);
        setError({ field: null, text: '' });
        const body = { title: trimmed, description: desc.trim() ? desc.trim() : null, data: payload.map };
        if (payload.cover) body.cover = payload.cover;
        let map = existing || null;
        let key = null;
        if (!existing) {
            const sig = `${trimmed}|${desc.trim()}|${payload.cover || ''}`;
            if (!retryKey.current || retryKey.current.sig !== sig) retryKey.current = { sig, key: freshKey().headers['Idempotency-Key'] };
            key = retryKey.current.key;
        }
        try {
            const res = existing ? await api.updateMap(existing.id, body) : await api.createMap(body, { key });
            retryKey.current = null;
            map = res?.map || map;
        } catch (err) {
            const { kind, data } = classifyKesifError(err);
            // Kesin sonuç (reddedildi) ise anahtar atılır: sunucu aynı anahtara eski hata yanıtını tekrarlardı.
            if (kind !== 'network' && kind !== 'server' && kind !== 'other') retryKey.current = null;
            lock.current = false;
            setBusy(false);
            if (kind === 'no_slot') {
                onNoSlot(payload);
                return;
            }
            const field = kind === 'text_blocked' ? (data.field === 'description' ? 'description' : 'title') : null;
            setError({ field, text: kesifErrorText(err, 'Harita kaydedilemedi.') });
            return;
        }
        // Harita yazıldı; yayın ayrı bir adım: başarısız olursa harita özel olarak saklı kalır.
        let published = false;
        let publishError = '';
        if (publishing && map?.id && map.visibility !== 'public') {
            try {
                const res = await api.publish(map.id);
                map = res?.map || map;
                published = true;
            } catch (err) {
                publishError = kesifErrorText(err, 'Harita yayınlanamadı.');
            }
        } else if (publishing && map?.visibility === 'public') {
            published = true;
        }
        setBusy(false);
        onDone(map, { published, publishError });
    };

    return (
        <Modal titleId="kxp-map-title" title={existing ? 'Haritayı kaydet' : publishing ? 'Haritayı yayınla' : 'Haritayı kaydet'} onKeyDownExtra={busy ? undefined : onClose}>
            <form className="kxp-form" onSubmit={submit} noValidate>
                <label htmlFor="kxp-map-name">Başlık</label>
                <input
                    id="kxp-map-name"
                    className="kxp-input"
                    type="text"
                    value={title}
                    maxLength={TITLE_MAX}
                    autoComplete="off"
                    data-autofocus
                    aria-invalid={Boolean(errFor('title'))}
                    aria-describedby={errFor('title') ? 'kxp-map-name-err' : undefined}
                    onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                />
                {errFor('title') && (
                    <p id="kxp-map-name-err" role="alert" className="kxp-err">
                        {errFor('title')}
                    </p>
                )}

                <label htmlFor="kxp-map-desc">
                    Açıklama <span style={{ fontWeight: 400, opacity: 0.7 }}>(isteğe bağlı)</span>
                </label>
                <textarea
                    id="kxp-map-desc"
                    className="kxp-input"
                    value={desc}
                    maxLength={DESC_MAX}
                    rows={3}
                    aria-invalid={Boolean(errFor('description'))}
                    aria-describedby={errFor('description') ? 'kxp-map-desc-err' : undefined}
                    onChange={(e) => setDesc(e.target.value.slice(0, DESC_MAX))}
                />
                <p className="kxp-count" aria-hidden="true">
                    {desc.length}/{DESC_MAX}
                </p>
                {errFor('description') && (
                    <p id="kxp-map-desc-err" role="alert" className="kxp-err">
                        {errFor('description')}
                    </p>
                )}

                <span className="kxp-label" id="kxp-vis-label">
                    Kimler görebilsin?
                </span>
                <div className="kxp-vis" role="radiogroup" aria-labelledby="kxp-vis-label">
                    <button type="button" role="radio" aria-checked={!publishing} onClick={() => setVisibility('private')}>
                        <span>
                            <LuLock aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Özel
                        </span>
                        <small>Yalnızca sen görürsün</small>
                    </button>
                    <button type="button" role="radio" aria-checked={publishing} onClick={() => setVisibility('public')}>
                        <span>
                            <LuGlobe aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Herkese açık
                        </span>
                        <small>Topluluk haritalarında</small>
                    </button>
                </div>

                {publishing && (
                    <label className="kxp-agree">
                        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                        <span>Haritamda kişisel bilgi, kötü söz, reklam ya da çocuklara uygun olmayan içerik yok. Uygunsuz haritalar kaldırılabilir.</span>
                    </label>
                )}
                {errFor('agree') && (
                    <p role="alert" className="kxp-err">
                        {errFor('agree')}
                    </p>
                )}
                {error.text && !error.field && (
                    <p role="alert" className="kxp-err">
                        {error.text}
                    </p>
                )}

                <div className="kx-stack" style={{ marginTop: 6 }}>
                    <button type="submit" className="kx-btn kx-btn-primary" disabled={!canSubmit}>
                        {publishing ? <LuGlobe aria-hidden="true" /> : <LuSave aria-hidden="true" />} {busy ? 'Kaydediliyor…' : publishing ? 'Kaydet ve yayınla' : 'Kaydet'}
                    </button>
                    <button type="button" className="kx-btn kx-btn-quiet" onClick={onClose} disabled={busy}>
                        Vazgeç
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const DoneDialog = ({ dialog, embedded, onClose, onOpenMaps }) => {
    const { map, published, publishError } = dialog;
    const warn = Boolean(publishError);
    return (
        <Modal
            titleId="kxp-done-title"
            title={warn ? 'Harita kaydedildi' : published ? 'Harita yayında' : 'Harita kaydedildi'}
            text={
                warn
                    ? `Harita özel olarak kaydedildi ama yayınlanamadı: ${publishError}`
                    : published
                      ? `"${map?.title || 'Haritan'}" artık Topluluk Haritaları'nda. İstediğin zaman gizleyebilirsin.`
                      : `"${map?.title || 'Haritan'}" Haritalarım'a kaydedildi. Kaydetmeye devam edersen aynı harita güncellenir.`
            }
            onKeyDownExtra={onClose}
        >
            <div className="kx-stack">
                <button type="button" className="kx-btn kx-btn-primary" onClick={onClose} data-autofocus>
                    {warn ? <LuTriangleAlert aria-hidden="true" /> : <LuCheck aria-hidden="true" />} Tamam
                </button>
                {embedded && onOpenMaps && (
                    <button type="button" className="kx-btn" onClick={onOpenMaps}>
                        <LuMap aria-hidden="true" /> Haritalarım
                    </button>
                )}
            </div>
        </Modal>
    );
};

const ErrorDialog = ({ text, onClose }) => (
    <Modal titleId="kxp-maperr-title" title="Harita kaydedilemedi" text={text} onKeyDownExtra={onClose}>
        <div className="kx-stack">
            <button type="button" className="kx-btn kx-btn-primary" onClick={onClose} data-autofocus>
                Tamam
            </button>
        </div>
    </Modal>
);

/** Harita akışının tüm pencereleri (flow = useKesifMapFlow sonucu). */
const KesifMapDialogs = ({ flow, api, embedded = false, onLogin, onOpenMaps }) => {
    const d = flow.dialog;
    if (!d) return null;
    if (d.kind === 'login') return <LoginPrompt why={d.why} onLogin={onLogin} onClose={flow.close} />;
    if (d.kind === 'error') return <ErrorDialog text={d.text} onClose={flow.close} />;
    if (d.kind === 'map') return <SaveMapForm key="map" payload={d.payload} api={api} onClose={flow.close} onDone={flow.done} onNoSlot={flow.noSlot} />;
    if (d.kind === 'done') return <DoneDialog dialog={d} embedded={embedded} onClose={flow.close} onOpenMaps={onOpenMaps} />;
    if (d.kind === 'slots') {
        return <SlotShop open api={api} profile={d.profile} wallet={d.wallet} onClose={flow.slotsClosed} onChange={flow.slotsChanged} />;
    }
    return null;
};

export default KesifMapDialogs;
