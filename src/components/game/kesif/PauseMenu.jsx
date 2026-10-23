import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuArrowLeft, LuCheck, LuCircleHelp, LuCopy, LuDoorOpen, LuFlag, LuImage, LuListChecks, LuMap, LuPlay, LuSave, LuSettings, LuShare2 } from 'react-icons/lu';
import MissionsMenu from './city/MissionsMenu.jsx';
import PauseHowTo from './PauseHowTo.jsx';
import PauseSettings from './PauseSettings.jsx';
import { KxSegment } from './KesifControls.jsx';
import { useFocusTrap } from './kxHooks.js';
import { copyText, normalizeKesifSettings, sanitizePatch } from './kxSettings.js';
import { REPORT_REASONS } from './kesifUtils.js';

/**
 * Duraklatma menüsü (role="dialog", odak tuzağı).
 *
 * Sayfalar: ana menü → ayarlar → nasıl oynanır / kontroller → çıkış onayı. Esc/P ile kapanma oturum/input katmanındadır (input 'pause'
 * olayı); burada Esc işlenmez ki iki kez tetiklenmesin. Ayarlar yerelde anında yansır ve `onChange(patch)` ile
 * oturuma bildirilir (kayıt oturumda).
 *
 * Props:
 *  settings, onChange(patch)            ayarlar (kısmi yama)
 *  onResume(), onSave() → bool|Promise  kaydet (harita modunda gizli), onExit()
 *  onPublish()                          yalnız verilirse "Haritayı yayınla" (inşa modu)
 *  mapTime, onMapTime(name)             yalnız onMapTime verilirse "Günün saati" seçimi (inşa modu): haritanın zamanı
 *                                       'gündüz' | 'gün batımı' | 'gece'; mapTime (HUD saat metni de olur) ilk seçimi belirler
 *  onReport(reasonKey) → bool|Promise   yalnız verilirse "Haritayı raporla" (paylaşılan harita oynarken; Play UGC kuralı)
 *  worldCode, onCopyCode(code)          dünya kodu kopyala (varsayılan: panoya)
 *  mode ('macera'|'insa'|'harita'), touch, gyroSupported, busy
 *  missionApi                           yalnız verilirse (Neon Meridyen) "Görevler" sayfası: {getMissionInfo, abandonMission, startRace}; openCityMap/photoOpen varsa "Şehir Haritası" ve "Foto Modu" düğmeleri
 */
const MAP_TIME_CHOICES = [
  { value: 'gündüz', label: 'Gündüz' },
  { value: 'gün batımı', label: 'Gün batımı' },
  { value: 'gece', label: 'Gece' },
];

/** HUD saat metni ("gün batımı 18:00", "şafak 06:10") ya da harita zamanı → 'gündüz' | 'gün batımı' | 'gece'. */
function mapTimeName(text) {
  const t = typeof text === 'string' ? text.trim().toLowerCase() : '';
  if (t.indexOf('gün batımı') === 0) return 'gün batımı';
  if (t.indexOf('gece') === 0) return 'gece';
  return 'gündüz';
}

const PauseMenu = ({ settings, onChange, onResume, onSave, onExit, onPublish, onReport, onMapTime, mapTime, worldCode, onCopyCode, mode = 'macera', touch = false, gyroSupported = true, busy = false, missionApi = null }) => {
  const [timeSel, setTimeSel] = useState(() => mapTimeName(mapTime));
  const pickTime = useCallback(
    (name) => {
      setTimeSel(name);
      if (onMapTime) onMapTime(name);
    },
    [onMapTime]
  );
  const boxRef = useRef(null);
  const firstRef = useRef(null);
  const [view, setView] = useState('main');
  const [howFrom, setHowFrom] = useState('main'); // Nasıl Oynanır sayfasından geri dönülecek sayfa (ana menü | ayarlar)
  const openHowTo = useCallback((from) => {
    setHowFrom(from);
    setView('howto');
  }, []);
  const [local, setLocal] = useState(() => normalizeKesifSettings(settings));
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  const [copyState, setCopyState] = useState('idle'); // idle | ok | fail
  const [reason, setReason] = useState('');
  const [reportState, setReportState] = useState('idle'); // idle | sending | done | error
  const mounted = useRef(true);
  const onKeyDown = useFocusTrap(boxRef, { initialRef: firstRef });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Dışarıdan gelen ayar değişimi (ör. oturum kalite kontrolcüsü) yerele yansır (render sırasında türetilir).
  const [prevSettings, setPrevSettings] = useState(settings);
  if (settings !== prevSettings) {
    setPrevSettings(settings);
    setLocal((cur) => normalizeKesifSettings(settings, cur));
  }

  // Sayfa değişince odak sayfanın ilk öğesine taşınır (ekran okuyucu yeni içeriği duyar).
  const lastView = useRef(view);
  useEffect(() => {
    if (lastView.current === view) return;
    lastView.current = view;
    const root = boxRef.current;
    const el = root && root.querySelector('[data-autofocus]');
    if (el) el.focus({ preventScroll: true });
  }, [view]);

  const set = useCallback(
    (patch) => {
      const clean = sanitizePatch(patch);
      if (!Object.keys(clean).length) return;
      setLocal((cur) => ({ ...cur, ...clean }));
      if (onChange) onChange(clean);
    },
    [onChange]
  );

  const doSave = async () => {
    if (!onSave || saveState === 'saving') return false;
    setSaveState('saving');
    let ok = false;
    try {
      ok = (await onSave()) !== false;
    } catch {
      ok = false;
    }
    if (mounted.current) setSaveState(ok ? 'saved' : 'error');
    return ok;
  };

  const doCopy = async () => {
    if (!worldCode) return;
    let ok = false;
    try {
      ok = onCopyCode ? (await onCopyCode(worldCode)) !== false : await copyText(worldCode);
    } catch {
      ok = false;
    }
    if (mounted.current) setCopyState(ok ? 'ok' : 'fail');
  };

  const doReport = async () => {
    if (!onReport || !reason || reportState === 'sending' || reportState === 'done') return;
    setReportState('sending');
    let ok = false;
    try {
      ok = (await onReport(reason)) !== false;
    } catch {
      ok = false;
    }
    if (mounted.current) setReportState(ok ? 'done' : 'error');
  };

  const saveAndExit = async () => {
    if (onSave) await doSave();
    if (onExit) onExit();
  };

  const canSave = Boolean(onSave) && mode !== 'harita';
  const titleId = 'kx-pause-title';
  const saveLabel = saveState === 'saving' ? 'Kaydediliyor…' : saveState === 'saved' ? 'Kaydedildi' : saveState === 'error' ? 'Kaydedilemedi, tekrar dene' : mode === 'insa' ? 'Haritayı kaydet' : 'Kaydet';

  return (
    <div className="kx-overlay kx-overlay-pause">
      <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="kx-card kx-pause" onKeyDown={onKeyDown} data-view={view}>
        {view === 'main' && (
          <>
            <h2 id={titleId} className="kx-h">
              Duraklatıldı
            </h2>
            <p className="kx-sub">Dünya seni bekliyor. Hazır olunca devam et.</p>
            <div className="kx-stack">
              <button ref={firstRef} type="button" className="kx-btn kx-btn-primary" onClick={onResume} disabled={busy} data-autofocus>
                <LuPlay aria-hidden="true" /> Devam et
              </button>
              {canSave && (
                <button type="button" className="kx-btn" onClick={doSave} disabled={busy || saveState === 'saving'} data-state={saveState}>
                  {saveState === 'saved' ? <LuCheck aria-hidden="true" /> : <LuSave aria-hidden="true" />} {saveLabel}
                </button>
              )}
              {onMapTime && mode === 'insa' && <KxSegment label="Günün saati" value={timeSel} choices={MAP_TIME_CHOICES} onChange={pickTime} />}
              {missionApi ? (
                <button type="button" className="kx-btn" onClick={() => setView('missions')} data-testid="kx-missions-open">
                  <LuListChecks aria-hidden="true" /> Görevler
                </button>
              ) : null}
              {missionApi && typeof missionApi.openCityMap === 'function' ? (
                <button type="button" className="kx-btn" onClick={() => missionApi.openCityMap()} data-testid="kx-citymap-open">
                  <LuMap aria-hidden="true" /> Şehir Haritası
                </button>
              ) : null}
              {missionApi && typeof missionApi.photoOpen === 'function' ? (
                <button type="button" className="kx-btn" onClick={() => missionApi.photoOpen()} data-testid="kx-photo-open">
                  <LuImage aria-hidden="true" /> Foto Modu
                </button>
              ) : null}
              <button type="button" className="kx-btn" onClick={() => setView('settings')}>
                <LuSettings aria-hidden="true" /> Ayarlar
              </button>
              <button type="button" className="kx-btn" onClick={() => openHowTo('main')} data-testid="kx-howto-open">
                <LuCircleHelp aria-hidden="true" /> Nasıl Oynanır / Kontroller
              </button>
              {onPublish && (
                <button type="button" className="kx-btn" onClick={onPublish} disabled={busy}>
                  <LuShare2 aria-hidden="true" /> Haritayı yayınla
                </button>
              )}
              {onReport && (
                <button type="button" className="kx-btn" onClick={() => setView('report')} disabled={busy}>
                  <LuFlag aria-hidden="true" /> Haritayı raporla
                </button>
              )}
              {worldCode ? (
                <button type="button" className="kx-btn" onClick={doCopy} data-state={copyState}>
                  {copyState === 'ok' ? <LuCheck aria-hidden="true" /> : <LuCopy aria-hidden="true" />}{' '}
                  {copyState === 'ok' ? 'Kopyalandı' : copyState === 'fail' ? 'Kopyalanamadı' : 'Dünya kodunu kopyala'}
                  <span className="kx-code">{worldCode}</span>
                </button>
              ) : null}
              <button type="button" className="kx-btn kx-btn-quiet" onClick={() => setView('confirm')} disabled={busy}>
                <LuDoorOpen aria-hidden="true" /> Çıkış
              </button>
            </div>
            <p className="kx-sr" role="status">
              {saveState === 'saved' ? 'Oyun kaydedildi.' : saveState === 'error' ? 'Kaydedilemedi.' : copyState === 'ok' ? 'Dünya kodu panoya kopyalandı.' : ''}
            </p>
          </>
        )}

        {view === 'settings' && (
          <>
            <div className="kx-head-row">
              <button type="button" className="kx-btn kx-btn-icon" onClick={() => setView('main')} aria-label="Geri" data-autofocus>
                <LuArrowLeft aria-hidden="true" />
              </button>
              <h2 id={titleId} className="kx-h kx-h-sm">
                Ayarlar
              </h2>
            </div>
            <div className="kx-scroll">
              <PauseSettings s={local} set={set} touch={touch} gyroSupported={gyroSupported} onHowTo={() => openHowTo('settings')} />
            </div>
            <button type="button" className="kx-btn kx-btn-primary kx-done" onClick={() => setView('main')}>
              Tamam
            </button>
          </>
        )}

        {view === 'missions' && (
          <>
            <div className="kx-head-row">
              <button type="button" className="kx-btn kx-btn-icon" onClick={() => setView('main')} aria-label="Geri" data-autofocus>
                <LuArrowLeft aria-hidden="true" />
              </button>
              <h2 id={titleId} className="kx-h kx-h-sm">
                Görevler
              </h2>
            </div>
            <div className="kx-scroll">
              <MissionsMenu api={missionApi} onResume={onResume} />
            </div>
            <button type="button" className="kx-btn kx-btn-primary kx-done" onClick={() => setView('main')}>
              Tamam
            </button>
          </>
        )}

        {view === 'howto' && (
          <>
            <div className="kx-head-row">
              <button type="button" className="kx-btn kx-btn-icon" onClick={() => setView(howFrom)} aria-label="Geri" data-autofocus>
                <LuArrowLeft aria-hidden="true" />
              </button>
              <h2 id={titleId} className="kx-h kx-h-sm">
                Nasıl Oynanır / Kontroller
              </h2>
            </div>
            <div className="kx-scroll">
              <PauseHowTo touch={touch} leftHanded={Boolean(local.leftHanded)} />
            </div>
            <button type="button" className="kx-btn kx-btn-primary kx-done" onClick={() => setView(howFrom)}>
              Tamam
            </button>
          </>
        )}

        {view === 'report' && (
          <>
            <div className="kx-head-row">
              <button type="button" className="kx-btn kx-btn-icon" onClick={() => setView('main')} aria-label="Geri" data-autofocus>
                <LuArrowLeft aria-hidden="true" />
              </button>
              <h2 id={titleId} className="kx-h kx-h-sm">
                Haritayı raporla
              </h2>
            </div>
            {reportState === 'done' ? (
              <p className="kx-sub" role="status">
                Teşekkürler. Bildirimin ekibimize ulaştı; harita incelenecek.
              </p>
            ) : (
              <>
                <p className="kx-sub">Seni rahatsız eden ne var?</p>
                <div className="kx-scroll">
                  <div className="kx-stack" role="radiogroup" aria-label="Rapor nedeni">
                    {REPORT_REASONS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        role="radio"
                        aria-checked={reason === r.key}
                        className={'kx-btn' + (reason === r.key ? ' kx-btn-primary' : '')}
                        onClick={() => setReason(r.key)}
                        disabled={reportState === 'sending'}
                      >
                        {reason === r.key ? <LuCheck aria-hidden="true" /> : <LuFlag aria-hidden="true" />} {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" className="kx-btn kx-btn-primary kx-done" onClick={doReport} disabled={!reason || reportState === 'sending'}>
                  {reportState === 'sending' ? 'Gönderiliyor…' : 'Gönder'}
                </button>
                <p className="kx-sr" role="status">
                  {reportState === 'error' ? 'Rapor gönderilemedi. Tekrar dene.' : ''}
                </p>
                {reportState === 'error' && <p className="kx-sub">Rapor gönderilemedi. Tekrar dene.</p>}
              </>
            )}
          </>
        )}

        {view === 'confirm' && (
          <>
            <h2 id={titleId} className="kx-h">
              Çıkmak istiyor musun?
            </h2>
            <p className="kx-sub">
              {canSave ? 'Kaydetmezsen son kayıttan sonraki ilerlemen kaybolabilir.' : 'Bu harita yalnızca oynamak içindir; çıkınca dünya sıfırlanır.'}
            </p>
            <div className="kx-stack">
              {canSave && (
                <button type="button" className="kx-btn kx-btn-primary" onClick={saveAndExit} disabled={busy} data-autofocus>
                  <LuSave aria-hidden="true" /> Kaydet ve çık
                </button>
              )}
              <button type="button" className={'kx-btn' + (canSave ? '' : ' kx-btn-primary')} onClick={onExit} disabled={busy} data-autofocus={canSave ? undefined : ''}>
                <LuDoorOpen aria-hidden="true" /> {canSave ? 'Kaydetmeden çık' : 'Çık'}
              </button>
              <button type="button" className="kx-btn kx-btn-quiet" onClick={() => setView('main')}>
                Vazgeç
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PauseMenu;
