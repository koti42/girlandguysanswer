import React, {
  memo, useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { drawFrame } from '../../../../game/kesif/render/city/photoFx.js';
import {
  SLIDERS, TABS, dragToOrbit, photoKeyAction, pinchToZoom, shotAria, shotSummary, valueText, wheelToZoom,
} from './photoUtils.js';
import './photo.css';

/*
 * Neon Meridyen FOTO MODU arayüzü (hud.ui === 'photo'; HUD gizlenir, sahne görünür kalır). Engine api: getPhotoState · photoSet(patch) · photoOrbit(dyaw,dpitch) · photoZoom(d) ·
 * photoCapture() · photoSave() · photoDiscard() · photoClose().
 *
 * Etkileşim: sahneyi sürükle (tek parmak/fare) = yörünge, iki parmak/tekerlek = yakınlaştır, oklar/+/−/[ ] klavye, Enter = çek. Panel (sağda; telefonda alt/yan) 4 sekme:
 * Kamera · Işık · Stil · Albüm. Hedefler ≥ 44 px, kaydırıcılar etiketli, seçenekler role="radio" (renk + ad), kare yakalama aria-live ile duyurulur.
 * reducedMotion / erişilebilirlik: deklanşör parlaması ve geçişler yok.
 *
 * Props: api, onClose, accessibility, reducedMotion, pollMs (varsayılan 180)
 */
const Slider = memo(function Slider({ def, value, onChange }) {
  const id = 'kph-sl-' + def.key;
  return (
    <div className="kph-row">
      <label htmlFor={id} className="kph-lab">{def.label}</label>
      <output htmlFor={id} className="kph-val">{valueText(def, value)}</output>
      <input
        id={id}
        className="kph-range"
        type="range"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        aria-valuetext={valueText(def, value)}
        onChange={(e) => onChange(def.key, Number(e.target.value))}
      />
    </div>
  );
});

const Radios = memo(function Radios({
  label, items, value, onPick, shape,
}) {
  return (
    <div className="kph-group" role="radiogroup" aria-label={label}>
      <p className="kph-gl">{label}</p>
      <div className="kph-chips">
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={value === it.id}
            className="kph-chip"
            data-on={value === it.id ? '1' : '0'}
            onClick={() => onPick(it.id)}
          >
            <span aria-hidden="true" className="kph-shape">{value === it.id ? '●' : shape}</span> {it.name}
          </button>
        ))}
      </div>
    </div>
  );
});

const Toggle = memo(function Toggle({
  label, on, onChange, hint,
}) {
  return (
    <button type="button" role="switch" aria-checked={on} className="kph-switch" data-on={on ? '1' : '0'} onClick={() => onChange(!on)}>
      <span className="kph-sw-box" aria-hidden="true">{on ? '✓' : ''}</span>
      <span className="kph-sw-text">
        {label}
        {hint ? <small>{hint}</small> : null}
      </span>
    </button>
  );
});

const PhotoOverlay = ({
  api, onClose, accessibility = false, reducedMotion = false, pollMs = 180,
}) => {
  const calm = accessibility || reducedMotion;
  const read = useCallback(() => {
    try {
      return api && typeof api.getPhotoState === 'function' ? api.getPhotoState() : null;
    } catch {
      return null;
    }
  }, [api]);
  const [state, setState] = useState(read);
  const last = useRef('');
  const refresh = useCallback(() => {
    const v = read();
    const k = v ? JSON.stringify(v) : '';
    if (k !== last.current) {
      last.current = k;
      setState(v);
    }
  }, [read]);
  const [tab, setTab] = useState('kamera');
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);
  const layerRef = useRef(null);
  const frameRef = useRef(null);
  const pointers = useRef(new Map());
  const pinch = useRef(0);
  const flip = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, pollMs);
    return () => clearInterval(id);
  }, [refresh, pollMs]);

  // klavye kullanıcısı hemen yörünge/yakınlaştırma yapabilsin: odak sahne katmanına; kapanınca açana döner
  const stateReady = Boolean(state && state.settings);
  useEffect(() => {
    if (!stateReady) return undefined;
    const opener = document.activeElement;
    const layer = layerRef.current;
    if (layer && layer.focus) layer.focus({ preventScroll: true });
    return () => {
      if (opener && opener !== document.body && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [stateReady]);

  const say = useCallback((text) => {
    flip.current = !flip.current;
    setMsg(text ? text + (flip.current ? '​' : '') : '');
  }, []);

  const settings = state && state.settings ? state.settings : null;

  /* ------------------------------------------------------------------ eylemler */
  const set = useCallback((key, value) => {
    if (api && typeof api.photoSet === 'function') api.photoSet({ [key]: value });
    refresh();
  }, [api, refresh]);
  const setMany = useCallback((patch) => {
    if (api && typeof api.photoSet === 'function') api.photoSet(patch);
    refresh();
  }, [api, refresh]);

  const orbit = useCallback((dy, dp) => {
    if (api && typeof api.photoOrbit === 'function') api.photoOrbit(dy, dp);
  }, [api]);
  const zoom = useCallback((d) => {
    if (api && typeof api.photoZoom === 'function') api.photoZoom(d);
  }, [api]);

  const capture = useCallback(async () => {
    if (!api || typeof api.photoCapture !== 'function' || busy) return;
    setBusy(true);
    let r = null;
    try {
      r = await api.photoCapture();
    } catch {
      r = null;
    }
    if (!mounted.current) return;
    setBusy(false);
    if (r && r.ok) {
      if (!calm) {
        setFlash(true);
        setTimeout(() => { if (mounted.current) setFlash(false); }, 180);
      }
      say(shotAria({ subjects: r.subjects, kredi: r.kredi }));
    } else say((r && r.message) || 'Kare yakalanamadı.');
    refresh();
  }, [api, busy, calm, refresh, say]);

  const save = useCallback(async () => {
    if (!api || typeof api.photoSave !== 'function') return;
    let r = null;
    try {
      r = await api.photoSave();
    } catch {
      r = null;
    }
    if (!mounted.current) return;
    say(r && r.ok ? 'Fotoğraf kaydedildi.' : (r && r.message) || 'Kaydedilemedi; tekrar dene.');
    refresh();
  }, [api, refresh, say]);

  const share = useCallback(async () => {
    if (!api || typeof api.photoShare !== 'function') return;
    let r = null;
    try {
      r = await api.photoShare();
    } catch {
      r = null;
    }
    if (!mounted.current) return;
    say((r && r.message) || 'Paylaşılamadı.');
    refresh();
  }, [api, refresh, say]);

  const discard = useCallback(() => {
    if (api && typeof api.photoDiscard === 'function') api.photoDiscard();
    say('Kare silindi.');
    refresh();
  }, [api, refresh, say]);

  const close = useCallback(() => {
    if (api && typeof api.photoClose === 'function') api.photoClose();
    if (onClose) onClose();
  }, [api, onClose]);

  /* ------------------------------------------------------------------ klavye */
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const t = e.target;
      if (t && t.closest && t.closest('.kph-dock')) return; // panel kendi klavyesini yönetir
      const a = photoKeyAction(e);
      if (!a) return;
      e.preventDefault();
      if (a.k === 'orbit') orbit(a.dyaw, a.dpitch);
      else if (a.k === 'zoom') {
        zoom(a.d);
        refresh();
      } else if (a.k === 'fov') {
        const cur = state && state.settings ? state.settings.fov : 62;
        setMany({ fov: cur + a.d });
      } else if (a.k === 'capture') capture();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [orbit, zoom, refresh, setMany, capture, state]);

  /* ------------------------------------------------------------------ işaretçi */
  useEffect(() => {
    const el = layerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoom(wheelToZoom(e.deltaY));
      refresh();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom, refresh]);

  const pinchDist = () => {
    const p = Array.from(pointers.current.values());
    return p.length >= 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  };
  const onPointerDown = (e) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = pinchDist();
    // dokunmatik işaretçiler zaten başladığı öğeye bağlıdır; yalnız fare/kalem için açık yakalama (aksi hâlde sürüklemeden sonraki ilk dokunuşun tıklaması yutulabilir)
    if (e.pointerType !== 'touch') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* yakalama desteklenmiyor */
      }
    }
  };
  const onPointerMove = (e) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size >= 2) {
      const d = pinchDist();
      if (pinch.current > 0) {
        zoom(pinchToZoom(pinch.current, d));
        refresh();
      }
      pinch.current = d;
    } else {
      const [dy, dp] = dragToOrbit(e.clientX - prev.x, e.clientY - prev.y);
      orbit(dy, dp);
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    pinch.current = pinchDist();
  };

  /* ------------------------------------------------------------------ çerçeve önizlemesi */
  const frameId = settings ? settings.frame : 'yok';
  const markOn = settings ? settings.mark !== false : true;
  useEffect(() => {
    const c = frameRef.current;
    if (!c) return undefined;
    const paint = () => {
      const w = Math.max(1, Math.round(c.clientWidth || window.innerWidth || 1));
      const h = Math.max(1, Math.round(c.clientHeight || window.innerHeight || 1));
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      let ctx = null;
      try {
        ctx = c.getContext('2d');
      } catch {
        ctx = null;
      }
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      drawFrame(ctx, w, h, frameId, { mark: markOn });
    };
    paint();
    window.addEventListener('resize', paint);
    return () => window.removeEventListener('resize', paint);
  }, [frameId, markOn]);

  const shot = state ? state.shot : null;
  const album = state ? state.album : null;
  const filters = state ? state.filters : [];
  const frames = state ? state.frames : [];
  const times = state ? state.times : [];
  const rains = state ? state.rains : [];
  const tabSliders = useMemo(() => SLIDERS.filter((s) => s.group === tab), [tab]);
  const summary = useMemo(() => shotSummary(shot), [shot]);

  if (!state || !settings) {
    return (
      <div className="kph-root" data-testid="photo-overlay">
        <p className="kph-empty" role="status">Foto modu hazırlanıyor…</p>
      </div>
    );
  }

  return (
    <div className="kph-root" data-testid="photo-overlay" data-calm={calm ? '1' : '0'} data-hidden={hidden ? '1' : '0'} data-a11y={accessibility ? '1' : '0'}>
      <div
        ref={layerRef}
        className="kph-layer"
        data-testid="photo-layer"
        role="application"
        aria-roledescription="foto kamerası"
        aria-label="Foto kamerası. Sürükleyerek çevresinde dön, iki parmakla ya da tekerlekle yaklaş. Klavye: oklar döndürür, artı ve eksi yaklaştırır, köşeli parantezler görüş açısını değiştirir, Enter fotoğraf çeker, Esc kapatır."
        tabIndex={0}
        data-autofocus
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <canvas ref={frameRef} className="kph-frame" aria-hidden="true" data-testid="photo-frame" />
      {flash ? <div className="kph-flash" aria-hidden="true" /> : null}

      <div className="kph-top">
        <button type="button" className="kph-btn kph-close" onClick={close} data-testid="photo-close" aria-label="Foto modunu kapat">
          <span aria-hidden="true">✕</span> Kapat
        </button>
        <button type="button" className="kph-btn" onClick={() => setHidden((h) => !h)} aria-pressed={hidden} data-testid="photo-toggle-panel">
          {hidden ? 'Paneli göster' : 'Paneli gizle'}
        </button>
      </div>

      <button type="button" className="kph-shutter" onClick={capture} disabled={busy} aria-label="Fotoğraf çek" data-testid="photo-shutter">
        <span className="kph-shutter-ring" aria-hidden="true" />
        <span className="kph-shutter-text">{busy ? '…' : 'Çek'}</span>
      </button>

      {!hidden ? (
        <aside className="kph-dock" aria-label="Foto ayarları" data-testid="photo-dock">
          <div className="kph-tabs" role="tablist" aria-label="Foto ayar bölümleri">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={'kph-tab-' + t.key}
                aria-selected={tab === t.key}
                aria-controls="kph-panel"
                tabIndex={tab === t.key ? 0 : -1}
                className="kph-tab"
                data-on={tab === t.key ? '1' : '0'}
                onClick={() => setTab(t.key)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="kph-panel" role="tabpanel" id="kph-panel" aria-labelledby={'kph-tab-' + tab}>
            {tab !== 'stil' ? tabSliders.map((def) => (
              <Slider key={def.key} def={def} value={settings[def.key]} onChange={set} />
            )) : null}
            {tab === 'kamera' ? (
              <>
                <Toggle label="Simülasyonu dondur" hint="Trafik, yayalar ve saat durur" on={settings.freeze} onChange={(v) => set('freeze', v)} />
                <Toggle label="Kendimi gizle" on={settings.hideSelf} onChange={(v) => set('hideSelf', v)} />
                <Toggle label="«Neon Meridyen» imi" on={settings.mark} onChange={(v) => set('mark', v)} />
              </>
            ) : null}
            {tab === 'isik' ? (
              <>
                <Radios label="Saat (yalnız görüntü)" items={times} value={settings.time} onPick={(v) => set('time', v)} shape="○" />
                <Radios label="Hava (yalnız görüntü)" items={rains} value={settings.rain} onPick={(v) => set('rain', v)} shape="○" />
                <p className="kph-note">Saat ve hava ön ayarları yalnız fotoğrafı değiştirir; şehrin gerçek saati ve havası aynı kalır.</p>
              </>
            ) : null}
            {tab === 'stil' ? (
              <>
                <Radios label="Filtre" items={filters} value={settings.filter} onPick={(v) => set('filter', v)} shape="◇" />
                <Radios label="Çerçeve" items={frames} value={settings.frame} onPick={(v) => set('frame', v)} shape="□" />
                {tabSliders.map((def) => (
                  <Slider key={def.key} def={def} value={settings[def.key]} onChange={set} />
                ))}
              </>
            ) : null}
            {tab === 'album' && album ? (
              <section aria-label="Fotoğraf albümü" data-testid="photo-album">
                <p className="kph-sum">
                  Albüm: <strong>{album.count}/{album.total}</strong>{album.done ? ' · tamamlandı' : ''} · çekilen kare: {album.taken}
                </p>
                {album.assignment ? <p className="kph-note kph-task">Görev: {album.assignment}</p> : null}
                <ul className="kph-album">
                  {album.subjects.map((s) => (
                    <li key={s.id} data-done={s.done ? '1' : '0'}>
                      <span aria-hidden="true">{s.done ? '✓' : '○'}</span>
                      <span className="kph-an">{s.name}</span>
                      <span className="kph-ah">{s.done ? 'Bulundu' : s.hint}</span>
                      <span className="kx-sr">{s.done ? 'Albümde' : 'Henüz yok'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </aside>
      ) : null}

      {shot ? (
        <aside className="kph-shot" aria-label="Yakalanan kare" data-testid="photo-shot">
          {shot.url ? <img className="kph-thumb" src={shot.url} alt="Yakalanan karenin küçük önizlemesi" /> : null}
          <p className="kph-sum">{summary}</p>
          {shot.kredi > 0 ? <p className="kph-note">+{shot.kredi} Kredi</p> : null}
          {!shot.counted ? <p className="kph-note">Aynı kadraj: sayaca eklenmedi.</p> : null}
          <div className="kph-shot-actions">
            <button type="button" className="kph-btn kph-primary" onClick={save} data-testid="photo-save">Kaydet</button>
            {state.canShare ? <button type="button" className="kph-btn" onClick={share} data-testid="photo-share">Paylaş</button> : null}
            <button type="button" className="kph-btn" onClick={discard} data-testid="photo-discard">Sil</button>
          </div>
        </aside>
      ) : null}

      <p className="kx-sr" role="status" aria-live="polite" data-testid="photo-live">{msg}</p>
    </div>
  );
};

export default memo(PhotoOverlay);
