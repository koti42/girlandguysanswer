import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { isAccessibilityOn } from '../../../utils/accessibility';
import { useGameTitle } from '../../../components/game/useNow';
import ErrorBoundary from '../../../components/game/ErrorBoundary';
import useViewportFitCover from '../../../components/game/runner/useViewportFitCover';
import { LOBBY_PATH } from '../../../components/game/tower/towerUtils';
import { normalizeAvatar } from '../../../game/avatar/catalog';
import TowerGameScreen from './TowerGameScreen';
import { readTowerEntry } from './useTowerSession';

/*
 * /oyun/kule/oyna: tam ekran kule oyunu (SPA). Lobiden gelen geçiş durumu
 * yalnızca ilk girişte okunur; sayfa yenilenince (tarayıcı history.state'i
 * korur) aynı kule baştan oynanmasın diye "tüketildi" olarak işaretlenir ve
 * durum yoksa lobiye dönülür.
 */
const TowerPlay = ({ entry }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    useGameTitle('Herkesler Yükseliyor');
    useViewportFitCover();

    useEffect(() => {
        if (location.state && !location.state.consumed) {
            navigate(location.pathname, { replace: true, state: { consumed: true } });
        }
    }, [location.pathname, location.state, navigate]);

    // Oyun karakteri (/user/me → detail.game_avatar); kaydetmemişse cinsiyetten varsayılan.
    const avatarRaw = user?.detail?.game_avatar ?? user?.game_avatar ?? null;
    const avatar = useMemo(() => normalizeAvatar(avatarRaw, user?.gender), [avatarRaw, user?.gender]);

    // replace: geri hareketi koruma kaydı geçmişte kalmasın (lobiden geri -> boş oyun ekranı).
    const exitToLobby = useCallback(() => navigate(LOBBY_PATH, { replace: true }), [navigate]);

    return <TowerGameScreen entry={entry} user={user} avatar={avatar} onExit={exitToLobby} historyGuard accessibility={isAccessibilityOn(user)} />;
};

const TowerPlayPage = () => {
    const location = useLocation();
    const [entry] = useState(() => readTowerEntry(location.state));
    if (!entry) return <Navigate to={LOBBY_PATH} replace />;
    // Arayüzdeki beklenmedik bir çizim hatası beyaz ekran yerine lobiye dönüş sunsun.
    return (
        <ErrorBoundary homeHref={LOBBY_PATH} homeLabel="Lobiye dön">
            <TowerPlay entry={entry} />
        </ErrorBoundary>
    );
};

export default TowerPlayPage;
