import React, { useCallback, useEffect, useState } from 'react';
import MapStage from '../../../components/game/protocolZero/MapStage';
import NewsTicker from '../../../components/game/protocolZero/NewsTicker';
import PzTopBar from '../../../components/game/protocolZero/PzTopBar';
import PzBottomBar from '../../../components/game/protocolZero/PzBottomBar';
import WorldStatusModal from '../../../components/game/protocolZero/WorldStatusModal';
import TechTreeModal from '../../../components/game/protocolZero/TechTreeModal';
import DilemmaModal from '../../../components/game/protocolZero/DilemmaModal';
import BreachMiniGame from '../../../components/game/protocolZero/BreachMiniGame';
import ReportScreen from '../../../components/game/protocolZero/ReportScreen';
import { BriefingOverlay, PauseMenu } from '../../../components/game/protocolZero/PzOverlays';
import { DIFFICULTIES } from '../../../game/protocolZero/constants';
import { detectLowPower } from '../../../components/game/protocolZero/pzUtils';
import usePzSession from './usePzSession';
import '../../../components/game/protocolZero/protocolZero.css';

/*
 * Tam ekran oyun katmanı (Plague Inc. düzeni). Katmanlar (alttan üste): taktik dünya haritası (canvas) →
 * haber bandı (üst) + takvim/hız (sağ üst) + gösterge paneli (alt: bütçe/ağaç · bölge bilgisi · dünya durumu)
 * → kipler (savunma ağacı, dünya durumu, ikilem, mini oyun, menü) → brifing / rapor.
 *
 * Props: entry { difficulty, seed }, user (null = misafir), onExit(), onReplay(), reducedMotion.
 */
const ProtocolZeroGameScreen = ({ entry, user, onExit, onReplay, reducedMotion = false }) => {
    const s = usePzSession({ entry, reducedMotion });
    const [lowPower] = useState(detectLowPower);
    const [mapError, setMapError] = useState(null);
    const cfg = DIFFICULTIES[entry.difficulty] || DIFFICULTIES.normal;

    // Klavye: boşluk duraklat, T ağaç, W dünya durumu, Esc kapat.
    useEffect(() => {
        const onKey = (e) => {
            if (!s.ui.started || s.finished) return;
            if (e.target && /input|textarea/i.test(e.target.tagName)) return;
            if (e.code === 'Space') {
                e.preventDefault();
                if (!s.ui.tech && !s.ui.world && !s.ui.menu && !s.ui.breachGame && !s.snap.dilemma) s.togglePause();
            } else if (e.key === 't' || e.key === 'T') {
                if (s.ui.tech) s.closeTech();
                else s.openTech();
            } else if (e.key === 'w' || e.key === 'W') {
                if (s.ui.world) s.closeWorld();
                else s.openWorld();
            } else if (e.key === 'Escape') {
                if (s.ui.tech) s.closeTech();
                else if (s.ui.world) s.closeWorld();
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
    const inGame = s.ui.started && !s.finished;

    return (
        <div className={`pz-screen ${s.snap.breach && !s.ui.breachGame && inGame ? 'pz-screen-alarm' : ''}`}>
            {mapError ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                    <div className="pz-glass max-w-sm rounded-3xl p-5">
                        <p className="font-extrabold text-white">Harita yüklenemedi</p>
                        <p className="mt-1 text-sm text-white/70">Ülke sınırları verisi indirilemedi. İnternet bağlantını kontrol edip tekrar dene.</p>
                        <button type="button" onClick={onExit} className="pz-btn pz-btn-primary mt-4">
                            Lobiye dön
                        </button>
                    </div>
                </div>
            ) : (
                <MapStage
                    onReady={s.onMapReady}
                    onSelect={s.select}
                    onPopBubble={s.pop}
                    onPacketArrive={s.onPacketArrive}
                    lowPower={lowPower}
                    reducedMotion={reducedMotion}
                    onError={setMapError}
                />
            )}

            {inGame && (
                <>
                    <NewsTicker items={s.snap.log} alert={s.alert || Boolean(s.snap.breach)} />
                    <PzTopBar
                        snap={s.snap}
                        startDate={s.startDate}
                        speed={s.speed}
                        onSpeed={s.setSpeed}
                        muted={s.muted}
                        onToggleMute={s.toggleMute}
                        onMenu={s.openMenu}
                        onIntervene={s.startBreachGame}
                    />
                    <PzBottomBar
                        snap={s.snap}
                        selectedNode={s.selectedNode}
                        countryName={s.countryName}
                        onTech={s.openTech}
                        onWorld={s.openWorld}
                        onCloseNode={() => s.select(null)}
                        onFirewall={() => s.actions.upgradeFirewall(s.selectedId)}
                        onPurge={() => s.actions.purge(s.selectedId)}
                        onIsolate={() => s.actions.toggleIsolate(s.selectedId)}
                        onIntervene={s.startBreachGame}
                        lastError={s.lastError}
                    />
                    <TechTreeModal open={s.ui.tech} techs={s.snap.techs} budget={s.snap.budget} onBuy={(id) => s.actions.buyTech(id)} onClose={s.closeTech} lastError={s.lastError} />
                    <WorldStatusModal open={s.ui.world} snap={s.snap} onClose={s.closeWorld} onPick={(id) => s.select(id, null)} />
                    {!s.ui.tech && !s.ui.world && !s.ui.breachGame && <DilemmaModal dilemma={s.snap.dilemma} onChoose={s.choose} />}
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

            {!s.ui.started && !mapError && <BriefingOverlay difficulty={entry.difficulty} archetype={entry.archetype} onStart={s.start} muted={s.muted} onToggleMute={s.toggleMute} />}

            {s.finished && s.result && <ReportScreen result={s.result} user={user} onReplay={onReplay} onExit={onExit} onSound={s.sfx} />}
        </div>
    );
};

export default ProtocolZeroGameScreen;
