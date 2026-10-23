import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { isAccessibilityOn } from '../../../utils/accessibility';
import { useGameTitle } from '../../../components/game/useNow';
import ErrorBoundary from '../../../components/game/ErrorBoundary';
import useViewportFitCover from '../../../components/game/runner/useViewportFitCover';
import { LOBBY_PATH, readEntry } from '../../../components/game/kesif/kesifUtils';
import { normalizeAvatar } from '../../../game/avatar/catalog';
import kesifApi from '../../../services/kesifApi';
import KesifGameScreen from './KesifGameScreen';

/*
 * /oyun/kesif/oyna: tam ekran Keşif oyunu (SPA). Lobiden gelen geçiş durumu ({ entry }, bkz.
 * kesifUtils.buildEntry/readEntry) yalnızca ilk girişte okunur; sayfa yenilenince (tarayıcı
 * history.state'i korur) aynı dünya baştan oynanmasın diye "tüketildi" olarak işaretlenir ve durum
 * yoksa lobiye dönülür. Misafir macera ve inşa deneyebilir; bulut/harita/ödül işleri üye ister.
 */
const KesifPlay = ({ entry, api }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticated } = useAuth();
    useGameTitle('Herkesler Keşfediyor');
    useViewportFitCover();

    useEffect(() => {
        if (location.state && !location.state.consumed) {
            navigate(location.pathname, { replace: true, state: { consumed: true } });
        }
    }, [location.pathname, location.state, navigate]);

    // Oyun karakteri (/user/me -> detail.game_avatar); kaydetmemişse cinsiyetten varsayılan.
    const avatarRaw = user?.detail?.game_avatar ?? user?.game_avatar ?? null;
    const avatar = useMemo(() => normalizeAvatar(avatarRaw, user?.gender), [avatarRaw, user?.gender]);

    // replace: geri hareketi koruma kaydı geçmişte kalmasın (lobiden geri -> boş oyun ekranı).
    const exitToLobby = useCallback(() => navigate(LOBBY_PATH, { replace: true }), [navigate]);
    // Giriş sayfasından sonra siteye dönülür; dönüş yolu bilgi olarak taşınır.
    const goLogin = useCallback(() => navigate('/login', { state: { from: LOBBY_PATH } }), [navigate]);

    return (
        <KesifGameScreen
            entry={entry}
            user={isAuthenticated ? user : null}
            avatar={avatar}
            api={api}
            onExit={exitToLobby}
            onLogin={goLogin}
            historyGuard
            accessibility={isAccessibilityOn(user)}
        />
    );
};

/** `api` yalnızca test için enjekte edilir. */
const KesifPlayPage = ({ api = kesifApi }) => {
    const location = useLocation();
    const [entry] = useState(() => readEntry(location.state));
    if (!entry) return <Navigate to={LOBBY_PATH} replace />;
    // Arayüzdeki beklenmedik bir çizim hatası beyaz ekran yerine lobiye dönüş sunsun.
    return (
        <ErrorBoundary homeHref={LOBBY_PATH} homeLabel="Lobiye dön">
            <KesifPlay entry={entry} api={api} />
        </ErrorBoundary>
    );
};

export default KesifPlayPage;
