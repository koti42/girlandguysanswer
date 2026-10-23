import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuCloudOff, LuCompass, LuDoorOpen, LuLogIn, LuMaximize, LuMinimize, LuMonitorX, LuMousePointerClick, LuRotateCcw, LuSave, LuSmartphone, LuTriangleAlert, LuX } from 'react-icons/lu';
import { useFocusTrap } from '../../../components/game/kesif/kxHooks.js';
import { isTouchUi } from '../../../components/game/kesif/kxHudUtils.js';
import { pickTip, tipsFor } from './kesifSessionUtils';
import { loadingLabel } from './useKesifSession';

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

/* ------------------------------------------------------------------ */
/* Yükleme ekranı                                                      */
/* ------------------------------------------------------------------ */

const TIP_MS = 4500;

/** Dünya hazırlanırken: ilerleme çubuğu (role=progressbar), dönen ipuçları, çıkış bağlantısı. */
export const LoadingScreen = ({ mode, progress, onExit, exitLabel = 'Vazgeç', reducedMotion = false }) => {
    const [touch] = useState(() => !!safe(() => isTouchUi()));
    const [tipIndex, setTipIndex] = useState(() => Math.floor((Date.now() / 1000) % tipsFor(!!safe(() => isTouchUi())).length));
    useEffect(() => {
        if (reducedMotion) return undefined;
        const id = setInterval(() => setTipIndex((i) => i + 1), TIP_MS);
        return () => clearInterval(id);
    }, [reducedMotion]);
    const pct = Math.round((progress?.value || 0) * 100);
    const indeterminate = pct <= 0;
    const label = progress?.label || loadingLabel(mode);
    return (
        <div className="kxp-loading" data-testid="kesif-loading">
            <span className="kxp-loading-ico" aria-hidden="true">
                <LuCompass />
            </span>
            <h1 className="kxp-title">Herkesler Keşfediyor</h1>
            <p className="kxp-sub" role="status" aria-live="polite">
                {label}…
            </p>
            <div className="kxp-bar" role="progressbar" aria-label="Yükleme ilerlemesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : pct} data-indeterminate={indeterminate ? '1' : '0'}>
                <span style={indeterminate ? undefined : { width: `${pct}%` }} />
            </div>
            <span className="kxp-pct" aria-hidden="true">
                {indeterminate ? ' ' : `%${pct}`}
            </span>
            <p className="kxp-tip" aria-hidden="true">
                <b>İpucu · </b>
                {pickTip(tipIndex, touch)}
            </p>
            {onExit && (
                <button type="button" className="kxp-link" onClick={onExit}>
                    {exitLabel}
                </button>
            )}
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Durum panelleri: WebGL yok, hata, bağlam kaybı                      */
/* ------------------------------------------------------------------ */

/** Tam ekran bilgi/hata paneli (role=alert, odak ilk düğmede). */
export const StatusPanel = ({ kind, message, retryable, onRetry, onExit, onLogin, exitLabel = 'Lobiye dön' }) => {
    const boxRef = useRef(null);
    const firstRef = useRef(null);
    const onKeyDown = useFocusTrap(boxRef, { initialRef: firstRef });
    const Icon = kind === 'nowebgl' ? LuMonitorX : kind === 'ctxlost' ? LuCloudOff : LuTriangleAlert;
    const title = kind === 'nowebgl' ? '3D desteklenmiyor' : kind === 'ctxlost' ? 'Grafik durdu' : 'Bir aksilik oldu';
    return (
        <div className="kx-overlay" data-testid={`kesif-${kind}`} style={{ zIndex: 75 }}>
            <div ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby="kxp-status-title" aria-describedby="kxp-status-desc" className="kx-card" onKeyDown={onKeyDown}>
                <span className="kx-dead-ico" aria-hidden="true">
                    <Icon />
                </span>
                <h2 id="kxp-status-title" className="kx-h">
                    {title}
                </h2>
                <p id="kxp-status-desc" className="kx-sub">
                    {message}
                </p>
                <div className="kx-stack">
                    {retryable && onRetry && (
                        <button ref={firstRef} type="button" className="kx-btn kx-btn-primary" onClick={onRetry}>
                            <LuRotateCcw aria-hidden="true" /> {kind === 'ctxlost' ? 'Yeniden dene' : 'Tekrar dene'}
                        </button>
                    )}
                    {onLogin && (
                        <button type="button" className="kx-btn" onClick={onLogin}>
                            <LuLogIn aria-hidden="true" /> Giriş yap
                        </button>
                    )}
                    <button ref={retryable && onRetry ? undefined : firstRef} type="button" className={`kx-btn${retryable && onRetry ? ' kx-btn-quiet' : ' kx-btn-primary'}`} onClick={onExit}>
                        <LuDoorOpen aria-hidden="true" /> {exitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Masaüstü: fare yakalama (tek satır)                                 */
/* ------------------------------------------------------------------ */

function pointerLocked(root) {
    const el = typeof document !== 'undefined' ? document.pointerLockElement : null;
    return Boolean(el && (!root || root.contains(el) || el === root));
}

/**
 * Masaüstünde fare yakalanmamışken küçük, sessiz tek satır: "Devam etmek için tıkla" (oyun hiç yakalanmadıysa "Başlamak için tıkla").
 * Kontrol listesi KENDİLİĞİNDEN çıkmaz (Duraklat > Ayarlar > Nasıl Oynanır'da durur); Esc yalnızca duraklatma menüsünü açar.
 * Yakalama oyun sırasında kullanıcı tarafından bırakılırsa (Esc) `onLockLost` ile menü açılır. Dokunmatikte çizilmez.
 */
export const PointerLockHint = ({ active, stageRef, onRequest, onLockLost }) => {
    const [locked, setLocked] = useState(false);
    const [everLocked, setEverLocked] = useState(false);
    const wasLocked = useRef(false);
    const lostRef = useRef(onLockLost);
    useEffect(() => {
        lostRef.current = onLockLost;
    }, [onLockLost]);

    useEffect(() => {
        const onChange = () => {
            const now = pointerLocked(stageRef?.current);
            setLocked(now);
            if (now) setEverLocked(true);
            if (wasLocked.current && !now) safe(() => lostRef.current?.());
            wasLocked.current = now;
        };
        document.addEventListener('pointerlockchange', onChange);
        return () => document.removeEventListener('pointerlockchange', onChange);
    }, [stageRef]);

    if (!active || locked) return null;
    const label = everLocked ? 'Devam etmek için tıkla' : 'Başlamak için tıkla';
    return (
        <button type="button" className="kxp-lock" onClick={onRequest} data-testid="kesif-lock" aria-label={label}>
            <LuMousePointerClick aria-hidden="true" />
            {label}
        </button>
    );
};

/* ------------------------------------------------------------------ */
/* Dikey telefon ipucu                                                 */
/* ------------------------------------------------------------------ */

const ORIENT_KEY = 'kesif.orient.hint';
const ORIENT_SHOW_MS = 9000;

function isPortrait() {
    try {
        return window.innerHeight > window.innerWidth;
    } catch {
        return false;
    }
}

/** Dikey tutulan telefonda "Telefonunu yan çevir" önerisi (oyun dikeyde de oynanır; kapatılabilir). */
export const OrientationHint = ({ active }) => {
    const [portrait, setPortrait] = useState(isPortrait);
    const [dismissed, setDismissed] = useState(() => safe(() => window.sessionStorage.getItem(ORIENT_KEY) === '1') === true);
    useEffect(() => {
        const on = () => setPortrait(isPortrait());
        window.addEventListener('resize', on);
        window.addEventListener('orientationchange', on);
        return () => {
            window.removeEventListener('resize', on);
            window.removeEventListener('orientationchange', on);
        };
    }, []);
    const hide = useCallback(() => {
        setDismissed(true);
        safe(() => window.sessionStorage.setItem(ORIENT_KEY, '1'));
    }, []);
    // Yatay tutulunca öneri kendiliğinden kalkar ve bir daha dikeyde çıkmaz.
    useEffect(() => {
        if (active && !portrait && !dismissed) {
            safe(() => window.sessionStorage.setItem(ORIENT_KEY, '1'));
        }
    }, [active, portrait, dismissed]);
    // Öneri birkaç sn sonra kendiliğinden kalkar (kullanıcı kapatmasa da ekranda asılı kalmaz) ve oturumda bir daha çıkmaz.
    const shown = active && portrait && !dismissed;
    useEffect(() => {
        if (!shown) return undefined;
        const t = setTimeout(hide, ORIENT_SHOW_MS);
        return () => clearTimeout(t);
    }, [shown, hide]);
    if (!shown) return null;
    return (
        <div className="kxp-orient" role="status" data-no-tap data-testid="kesif-orient">
            <LuSmartphone aria-hidden="true" style={{ transform: 'rotate(90deg)', flex: 'none' }} />
            <span>Daha geniş görüş için telefonunu yan çevir. Dikeyde de oynayabilirsin.</span>
            <button type="button" onClick={hide} aria-label="İpucunu kapat">
                <LuX aria-hidden="true" />
            </button>
        </div>
    );
};

/* ------------------------------------------------------------------ */
/* Tam ekran                                                           */
/* ------------------------------------------------------------------ */

const fsElement = () => (typeof document !== 'undefined' ? document.fullscreenElement || document.webkitFullscreenElement || null : null);

/** Masaüstü tam ekran düğmesi (destek yoksa çizilmez). */
export const FullscreenButton = ({ targetRef }) => {
    const [on, setOn] = useState(() => Boolean(fsElement()));
    useEffect(() => {
        const h = () => setOn(Boolean(fsElement()));
        document.addEventListener('fullscreenchange', h);
        document.addEventListener('webkitfullscreenchange', h);
        return () => {
            document.removeEventListener('fullscreenchange', h);
            document.removeEventListener('webkitfullscreenchange', h);
        };
    }, []);
    const el = targetRef?.current;
    const supported = typeof document !== 'undefined' && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
    if (!supported) return null;
    const toggle = () => {
        if (fsElement()) {
            safe(() => (document.exitFullscreen || document.webkitExitFullscreen).call(document));
            return;
        }
        const t = targetRef?.current || el || document.documentElement;
        const req = t.requestFullscreen || t.webkitRequestFullscreen;
        if (req) safe(() => Promise.resolve(req.call(t)).catch(() => {}));
    };
    return (
        <button type="button" className="kxp-fs kx-hide-ui" data-no-tap aria-pressed={on} aria-label={on ? 'Tam ekrandan çık' : 'Tam ekran'} title={on ? 'Tam ekrandan çık' : 'Tam ekran'} onClick={toggle}>
            {on ? <LuMinimize aria-hidden="true" /> : <LuMaximize aria-hidden="true" />}
        </button>
    );
};

/* ------------------------------------------------------------------ */
/* Çıkış onayı / giriş çağrısı                                         */
/* ------------------------------------------------------------------ */

const Modal = ({ titleId, title, text, children, onKeyDownExtra }) => {
    const boxRef = useRef(null);
    const trap = useFocusTrap(boxRef, {});
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            // Motorun girdi katmanı Esc'i duraklat/devam diye dinleyebilir; pencere kendi Esc'ini yutar.
            e.stopPropagation();
            if (onKeyDownExtra) onKeyDownExtra(e);
            return;
        }
        trap(e);
    };
    return (
        <div className="kx-overlay">
            <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="kx-card" onKeyDown={onKeyDown}>
                <h2 id={titleId} className="kx-h">
                    {title}
                </h2>
                {text && <p className="kx-sub">{text}</p>}
                {children}
            </div>
        </div>
    );
};

/** canSave: macera/inşa (üye). Kaydet ve çık / Kaydetmeden çık / Vazgeç. */
export const ExitConfirm = ({ mode, member, onSaveExit, onExit, onClose }) => {
    const canSave = mode === 'macera' || (mode === 'insa' && member);
    const text =
        mode === 'harita'
            ? 'Bu harita yalnızca oynamak içindir; çıkınca dünya sıfırlanır.'
            : mode === 'insa' && !member
              ? 'İnşa denemen kaydedilmez. Haritanı saklamak için giriş yapmalısın.'
              : mode === 'insa'
                ? 'Haritayı kaydetmezsen son kayıttan sonraki yapıların kaybolabilir.'
                : 'Kaydetmezsen son kayıttan sonraki ilerlemen kaybolabilir.';
    return (
        <Modal titleId="kxp-exit-title" title="Çıkmak istiyor musun?" text={text} onKeyDownExtra={onClose}>
            <div className="kx-stack">
                {canSave && (
                    <button type="button" className="kx-btn kx-btn-primary" onClick={onSaveExit} data-autofocus>
                        <LuSave aria-hidden="true" /> {mode === 'insa' ? 'Haritayı kaydet ve çık' : 'Kaydet ve çık'}
                    </button>
                )}
                <button type="button" className={`kx-btn${canSave ? '' : ' kx-btn-primary'}`} onClick={onExit}>
                    <LuDoorOpen aria-hidden="true" /> {canSave ? 'Kaydetmeden çık' : 'Çık'}
                </button>
                <button type="button" className="kx-btn kx-btn-quiet" onClick={onClose}>
                    Vazgeç
                </button>
            </div>
        </Modal>
    );
};

/** Misafir: harita kaydetme/yayınlama için giriş çağrısı. */
export const LoginPrompt = ({ why, onLogin, onClose }) => (
    <Modal
        titleId="kxp-login-title"
        title="Giriş yapman gerekiyor"
        text={
            (why === 'publish' ? 'Haritanı yayınlamak ' : 'Haritanı kaydetmek ') +
            'için üye girişi gerekir. Giriş sayfasına gidersen bu oyundan ayrılırsın ve şu anki inşa denemen kaydedilmez.'
        }
        onKeyDownExtra={onClose}
    >
        <div className="kx-stack">
            <button type="button" className="kx-btn kx-btn-primary" onClick={onLogin} data-autofocus>
                <LuLogIn aria-hidden="true" /> Giriş yap
            </button>
            <button type="button" className="kx-btn kx-btn-quiet" onClick={onClose}>
                Oynamaya devam et
            </button>
        </div>
    </Modal>
);

export { Modal };
