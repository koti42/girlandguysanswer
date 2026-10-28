import React, { useCallback, useEffect, useState } from 'react';
import GlobeStage from '../../../components/game/protocolZero/GlobeStage';
import PzHud from '../../../components/game/protocolZero/PzHud';
import NodeDrawer from '../../../components/game/protocolZero/NodeDrawer';
import TechTreeModal from '../../../components/game/protocolZero/TechTreeModal';
import DilemmaModal from '../../../components/game/protocolZero/DilemmaModal';
import BreachMiniGame from '../../../components/game/protocolZero/BreachMiniGame';
import ReportScreen from '../../../components/game/protocolZero/ReportScreen';
import { BriefingOverlay, EventLog, EventTicker, PauseMenu } from '../../../components/game/protocolZero/PzOverlays';
import { DIFFICULTIES } from '../../../game/protocolZero/constants';
import { detectLowPower } from '../../../components/game/protocolZero/pzUtils';
import usePzSession from './usePzSession';
import '../../../components/game/protocolZero/protocolZero.css';

/*
 * Tam ekran oyun katmanı. Katmanlar (alttan üste): küre tuvali → HUD + olay günlüğü → düğüm çekmecesi →
 * kipler (savunma ağacı, ikilem, mini oyun, menü) → brifing / rapor.
 *
 * Props: entry { difficulty, seed }, user (null = misafir), onExit(), onReplay(), reducedMotion.
 */
const ProtocolZeroGameScreen = ({ entry, user, onExit, onReplay, reducedMotion = false }) => {
    const s = usePzSession({ entry, reducedMotion });
    const [lowPower] = useState(detectLowPower);
    const [globeError, setGlobeError] = useState(null);
    const cfg = DIFFICULTIES[entry.difficulty] || DIFFICULTIES.normal;

    // Klavye: boşluk duraklat, T ağaç, Esc kapat.
    useEffect(() => {
        const onKey = (e) => {
            if (!s.ui.started || s.finished) return;
            if (e.target && /input|textarea/i.test(e.target.tagName)) return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (!s.ui.tech && !s.ui.menu && !s.ui.breachGame && !s.snap.dilemma) s.togglePause();
            } else if (e.key === 't' || e.key === 'T') {
                if (s.ui.tech) s.closeTech();
                else s.openTech();
            } else if (e.key === 'Escape') {
                if (s.ui.tech) s.closeTech();
                else if (s.ui.menu) s.closeMenu();
                else if (s.selectedId) s.select(null);
                else s.openMenu();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [s]);

    const onDone = useCallback((ok) => s.resolveBreach(ok), [s]);

    const breachNode = s.snap.breach ? s.snap.nodes.find((n) => n.id === s.snap.breach.nodeId) : null;

    return (
        <div className={`pz-screen ${s.snap.breach && !s.ui.breachGame && s.ui.started && !s.finished ? 'pz-screen-alarm' : ''}`}>
            {globeError ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                    <div className="pz-glass max-w-sm rounded-3xl p-5">
                        <p className="font-extrabold text-white">3D küre başlatılamadı</p>
                        <p className="mt-1 text-sm text-white/70">Tarayıcın WebGL'i desteklemiyor ya da donanım hızlandırma kapalı.</p>
                        <button type="button" onClick={onExit} className="pz-btn pz-btn-primary mt-4">
                            Lobiye dön
                        </button>
                    </div>
                </div>
            ) : (
                <GlobeStage onReady={s.onGlobeReady} onSelect={s.select} lowPower={lowPower} reducedMotion={reducedMotion} onError={setGlobeError} />
            )}

            {s.ui.started && !s.finished && (
                <>
                    <PzHud
                        snap={s.snap}
                        speed={s.speed}
                        onSpeed={s.setSpeed}
                        muted={s.muted}
                        onToggleMute={s.toggleMute}
                        onTech={s.openTech}
                        onPause={s.openMenu}
                        onExit={onExit}
                        onIntervene={s.startBreachGame}
                        breachAlarmActive={!s.ui.breachGame}
                    />
                    <EventLog items={s.snap.log.slice(0, 4)} />
                    {!s.selectedNode && <EventTicker item={s.snap.log[0]} />}
                    <NodeDrawer
                        node={s.selectedNode}
                        budget={s.snap.budget}
                        breach={s.snap.breach}
                        onClose={() => s.select(null)}
                        onFirewall={() => s.actions.upgradeFirewall(s.selectedId)}
                        onPurge={() => s.actions.purge(s.selectedId)}
                        onIsolate={() => s.actions.toggleIsolate(s.selectedId)}
                        onIntervene={s.startBreachGame}
                        lastError={s.lastError}
                    />
                    <TechTreeModal open={s.ui.tech} techs={s.snap.techs} budget={s.snap.budget} onBuy={(id) => s.actions.buyTech(id)} onClose={s.closeTech} lastError={s.lastError} />
                    {!s.ui.tech && !s.ui.breachGame && <DilemmaModal dilemma={s.snap.dilemma} onChoose={s.choose} />}
                    <BreachMiniGame
                        open={s.ui.breachGame}
                        nodeName={breachNode?.name || 'Düğüm'}
                        seconds={cfg.breachSeconds}
                        targets={cfg.breachTargets}
                        seed={s.breachSeed}
                        onDone={onDone}
                        onSound={s.sfx}
                    />
                    <PauseMenu open={s.ui.menu} onResume={s.closeMenu} onExit={onExit} muted={s.muted} onToggleMute={s.toggleMute} day={s.snap.day} />
                </>
            )}

            {!s.ui.started && !globeError && <BriefingOverlay difficulty={entry.difficulty} onStart={s.start} muted={s.muted} onToggleMute={s.toggleMute} />}

            {s.finished && s.result && <ReportScreen result={s.result} user={user} onReplay={onReplay} onExit={onExit} onSound={s.sfx} />}
        </div>
    );
};

export default ProtocolZeroGameScreen;
