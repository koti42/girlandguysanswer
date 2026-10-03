import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useGameTitle } from '../../../components/game/useNow';
import ErrorBoundary from '../../../components/game/ErrorBoundary';
import RunnerStage from '../../../components/game/runner/RunnerStage';
import useViewportFitCover from '../../../components/game/runner/useViewportFitCover';
import { RUNNER_SIM_VERSION, normalizeRun } from '../../../components/game/runner/runnerUtils';
import { normalizeAvatar } from '../../../game/avatar/catalog';
import { gameApi } from '../../../services/gameApi';
import useRunnerSession, { PLAYING } from './useRunnerSession';
import '../../../components/game/game.css';

const LOBBY = '/oyun/kosu';
// Tarayıcı geri hareketine karşı geçmişe eklenen koruma kaydı.
const GUARD_STATE = 'runnerGuard';

const pushGuard = () => {
    // idx / key alanları korunur: React Router'ın geçmiş sırası bozulmasın.
    window.history.pushState({ ...(window.history.state || {}), [GUARD_STATE]: true }, '');
};

const safe = (fn) => {
    try {
        return fn();
    } catch {
        return undefined;
    }
};

/*
 * Lobiden gelen geçiş durumu. Yalnızca ilk girişte okunur; sayfa yenilenince
 * (tarayıcı history.state'i korur) koşu baştan oynanmasın diye giriş anında
 * "tüketildi" olarak işaretlenir ve lobiye dönülür.
 */
function readEntry(state) {
    if (!state || typeof state !== 'object' || state.consumed) return null;
    if (state.mode === 'ranked') {
        const run = normalizeRun(state.run);
        return run && run.simVersion === RUNNER_SIM_VERSION ? { mode: 'ranked', run } : null;
    }
    if (state.mode === 'practice') return { mode: 'practice' };
    return null;
}

/*
 * Oyun ekranı (SPA). Oturum mantığı useRunnerSession'da (mobil gömmeyle
 * ortak), görünüm RunnerStage'de. Burada yalnızca sayfaya özgü olanlar var:
 * geçiş durumunun tüketilmesi, çentikli ekran, sekme başlığı, lobiye dönüş
 * ve tarayıcı geri hareketi koruması.
 */
const RunnerGame = ({ entry }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    useGameTitle('Herkesler Koşuyor');
    useViewportFitCover();

    // Karakter sunucudaki avatar yapılandırmasından (yoksa cinsiyete göre varsayılan); motor kurulurken okunur.
    const [avatar] = useState(() => normalizeAvatar(user?.detail?.game_avatar, user?.gender));
    // replace: geri hareketi koruma kaydı geçmişte kalmasın (lobiden geri -> boş oyun ekranı).
    const toLobby = useCallback(() => navigate(LOBBY, { replace: true }), [navigate]);

    const s = useRunnerSession({ entry, api: gameApi, userId: user?.id ?? null, avatar, onExit: toLobby });
    const { phase, pause, finishNow, getPhase } = s;
    // Geçmişte en üstte geri hareketi koruma kaydımız var mı?
    const guardRef = useRef(false);

    // Geçiş durumunu tüket: yenilemede aynı koşu baştan oynanmasın.
    useEffect(() => {
        if (location.state && !location.state.consumed) {
            navigate(location.pathname, { replace: true, state: { consumed: true } });
        }
    }, [location.pathname, location.state, navigate]);

    /*
     * Tarayıcı geri hareketi koruması. Oyun yatay kaydırmayla oynanıyor;
     * Android hareketli gezinme ve iOS Safari kenar kaydırması Geri yapıyor
     * ve sayfa bunu engelleyemiyor. Koşu başlayınca geçmişe aynı adreste bir
     * koruma kaydı eklenir; geri hareketi önce onu tüketir: oyun duraklar,
     * koruma yeniden eklenir. Oyun dışındaki aşamalarda (sonuç, hata) geri
     * hareketi doğrudan lobiye götürür.
     */
    useEffect(() => {
        if (!PLAYING.includes(phase) || guardRef.current) return;
        if (safe(() => (pushGuard(), true))) guardRef.current = true;
    }, [phase]);

    useEffect(() => {
        const onPop = () => {
            if (!guardRef.current) return;
            // Koruma kaydı tüketildi: artık asıl oyun kaydındayız.
            guardRef.current = false;
            if (PLAYING.includes(getPhase())) {
                if (safe(() => (pushGuard(), true))) guardRef.current = true;
                pause();
                return;
            }
            toLobby();
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, [pause, getPhase, toLobby]);

    // Motor yoksa "Bitir" lobiye döner (bilerek çıkış sayılmaz: açık koşu sökülmede kaydedilir/terk edilir).
    const onFinish = () => {
        if (!finishNow()) toLobby();
    };

    return <RunnerStage s={s} guest={!user} onFinish={onFinish} />;
};

const RunnerPlayPage = () => {
    const location = useLocation();
    // Yalnızca ilk çizimde okunur; sonradan "tüketildi" olarak işaretlenen durum bunu etkilemez.
    const [entry] = useState(() => readEntry(location.state));
    if (!entry) return <Navigate to={LOBBY} replace />;
    // Arayüzdeki beklenmedik bir çizim hatası beyaz ekran yerine lobiye dönüş sunsun.
    return (
        <ErrorBoundary homeHref={LOBBY} homeLabel="Lobiye dön">
            <RunnerGame entry={entry} />
        </ErrorBoundary>
    );
};

export default RunnerPlayPage;
