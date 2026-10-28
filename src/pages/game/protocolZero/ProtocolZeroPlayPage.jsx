import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useGameTitle } from '../../../components/game/useNow';
import ErrorBoundary from '../../../components/game/ErrorBoundary';
import useViewportFitCover from '../../../components/game/runner/useViewportFitCover';
import { prefersReducedMotion } from '../../../components/game/gameUtils';
import { LOBBY_PATH, buildEntry, readEntry } from '../../../components/game/protocolZero/pzUtils';
import ProtocolZeroGameScreen from './ProtocolZeroGameScreen';

/*
 * /oyun/protocol-zero/oyna: tam ekran PROTOCOL: ZERO. Lobiden gelen geçiş durumu ({ entry }) yalnızca ilk
 * girişte okunur; sayfa yenilenince aynı oyun baştan başlamasın diye "tüketildi" işaretlenir ve durum yoksa
 * lobiye dönülür. Üyeliksiz oynanır; `user` yalnızca skor kaydında ad için kullanılır.
 */
const Play = ({ initialEntry }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isAuthenticated } = useAuth();
    const [entry, setEntry] = useState(initialEntry);
    useGameTitle('PROTOCOL: ZERO');
    useViewportFitCover();

    useEffect(() => {
        if (location.state && !location.state.consumed) {
            navigate(location.pathname, { replace: true, state: { consumed: true } });
        }
    }, [location.pathname, location.state, navigate]);

    const exitToLobby = useCallback(() => navigate(LOBBY_PATH, { replace: true }), [navigate]);
    const replay = useCallback(() => setEntry((e) => buildEntry({ difficulty: e.difficulty, archetype: e.archetype, genes: e.genes, seed: Date.now() })), []);

    return (
        <ProtocolZeroGameScreen
            key={`${entry.difficulty}:${entry.archetype}:${entry.seed}`}
            entry={entry}
            user={isAuthenticated ? user : null}
            onExit={exitToLobby}
            onReplay={replay}
            reducedMotion={prefersReducedMotion()}
        />
    );
};

const ProtocolZeroPlayPage = () => {
    const location = useLocation();
    const [entry] = useState(() => readEntry(location.state));
    if (!entry) return <Navigate to={LOBBY_PATH} replace />;
    return (
        <ErrorBoundary homeHref={LOBBY_PATH} homeLabel="Lobiye dön">
            <Play initialEntry={entry} />
        </ErrorBoundary>
    );
};

export default ProtocolZeroPlayPage;
