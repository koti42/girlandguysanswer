import React, { useCallback, useEffect, useRef, useState } from 'react';
import MapStage from '../../../components/game/protocolZero/MapStage';
import PzTopBar from '../../../components/game/protocolZero/PzTopBar';
import PzBottomBar from '../../../components/game/protocolZero/PzBottomBar';
import PzSidebar from '../../../components/game/protocolZero/PzSidebar';
import RegionPanel from '../../../components/game/protocolZero/RegionPanel';
import ResearchPanel from '../../../components/game/protocolZero/ResearchPanel';
import ThreatPanel from '../../../components/game/protocolZero/ThreatPanel';
import SettingsPanel from '../../../components/game/protocolZero/SettingsPanel';
import StatsPanel from '../../../components/game/protocolZero/StatsPanel';
import DilemmaModal from '../../../components/game/protocolZero/DilemmaModal';
import BreachMiniGame from '../../../components/game/protocolZero/BreachMiniGame';
import ReportScreen from '../../../components/game/protocolZero/ReportScreen';
import { BriefingOverlay, PauseMenu } from '../../../components/game/protocolZero/PzOverlays';
import { DIFFICULTIES } from '../../../game/protocolZero/constants';
import { detectLowPower } from '../../../components/game/protocolZero/pzUtils';
import usePzSession from './usePzSession';
import '../../../components/game/protocolZero/protocolZero.css';

/*
 * Tam ekran komuta merkezi (Plague Inc. düzeni). Katmanlar (alttan üste): taktik dünya haritası (canvas) →
 * neon çerçeve → üst şerit (haber bandı + hız) · sol menü (Dünya/Tehdit/Araştırma/İstatistikler/Ayarlar) ·
 * alt gösterge paneli → sağ panel (bölge / araştırma / tehdit / ayarlar) → kipler (dünya durumu, ikilem,
 * mini oyun, duraklatma) → brifing / rapor.
 *
 * Props: entry { difficulty, archetype, genes, seed }, user (null = misafir), onExit(), onReplay(), reducedMotion.
 */
const ProtocolZeroGameScreen = ({ entry, user, onExit, onReplay, reducedMotion = false }) => {
    const s = usePzSession({ entry, reducedMotion });
    const [lowPower] = useState(detectLowPower);
    const [mapError, setMapError] = useState(null);
    const cfg = DIFFICULTIES[entry.difficulty] || DIFFICULTIES.normal;

    // Klavye: boşluk duraklat, T araştırma, G dünya durumu, H tehdit, Esc kapat. Dinleyici bir kez bağlanır (ref).
    const sRef = useRef(s);
    useEffect(() => {
        sRef.current = s;
    }, [s]);
    useEffect(() => {
        const onKey = (e) => {
            const s = sRef.current;
            if (!s.ui.started || s.finished) return;
            if (s.ui.breachGame || s.snap.dilemma) return; // mini oyun / ikilem: kısayollar kapalı
            if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
            const k = e.key.toLowerCase();
            if (e.code === 'Space') {
                e.preventDefault();
                if (!s.ui.panel && !s.ui.menu && !s.ui.breachGame && !s.snap.dilemma) s.togglePause();
            } else if (k === 't') s.openPanel('research');
            else if (k === 'g') s.openPanel('stats');
            else if (k === 'h') s.openPanel('threat');
            else if (e.key === 'Escape') {
                if (s.ui.panel) s.closePanel();
                else if (s.ui.menu) s.closeMenu();
                else if (s.selectedId) s.select(null);
                else s.openMenu();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const onDone = useCallback((ok) => sRef.current.resolveBreach(ok), []);
    const breachNode = s.snap.breach ? s.snap.nodes.find((n) => n.id === s.snap.breach.nodeId) : null;
    const inGame = s.ui.started && !s.finished;
    const sideActive = s.ui.panel || 'map';
    const onSide = (key) => {
        if (key === 'map') {
            s.closePanel();
            s.select(null);
        } else s.openPanel(key);
    };
    const pickOnMap = (id) => {
        s.closePanel();
        s.select(id, null);
    };

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
                <MapStage onReady={s.onMapReady} onSelect={s.select} onPopBubble={s.pop} onPacketArrive={s.onPacketArrive} lowPower={lowPower} reducedMotion={reducedMotion} onError={setMapError} />
            )}
            <div className="pz-frame" aria-hidden="true" />
            <style>{`.pz-screen{--pz-panel-w:${inGame && (s.selectedNode || (s.ui.panel && s.ui.panel !== 'stats')) ? '400px' : '0px'}}`}</style>

            {inGame && (
                <>
                    <PzTopBar snap={s.snap} alert={s.alert} speed={s.speed} onSpeed={s.setSpeed} onSettings={() => s.openPanel('settings')} onIntervene={s.startBreachGame} />
                    <PzSidebar active={sideActive} onSelect={onSide} badges={{ threat: s.snap.breach ? 1 : 0 }} />
                    <PzBottomBar
                        snap={s.snap}
                        startDate={s.startDate}
                        speed={s.speed}
                        onSpeed={s.setSpeed}
                        paused={s.speed === 0}
                        onTogglePause={s.togglePause}
                        onTech={() => s.openPanel('research')}
                        onWorld={() => s.openPanel('stats')}
                        onIntervene={s.startBreachGame}
                    />

                    {s.selectedNode && !s.ui.panel && (
                        <RegionPanel
                            node={s.selectedNode}
                            nodes={s.snap.nodes}
                            countryName={s.countryName}
                            budget={s.snap.budget}
                            breach={s.snap.breach}
                            purgeAmount={s.snap.purgeAmount}
                            onClose={() => s.select(null)}
                            onFirewall={() => s.actions.upgradeFirewall(s.selectedId)}
                            onPurge={() => s.actions.purge(s.selectedId)}
                            onIsolate={() => s.actions.toggleIsolate(s.selectedId)}
                            onIntervene={s.startBreachGame}
                            onPick={(id) => s.select(id, null)}
                            lastError={s.lastError}
                        />
                    )}
                    {s.ui.panel === 'research' && <ResearchPanel snap={s.snap} onBuy={(id) => s.actions.buyTech(id)} onClose={s.closePanel} lastError={s.lastError} />}
                    {s.ui.panel === 'threat' && <ThreatPanel snap={s.snap} onClose={s.closePanel} onPick={pickOnMap} />}
                    {s.ui.panel === 'settings' && (
                        <SettingsPanel muted={s.muted} onToggleMute={s.toggleMute} speed={s.speed} onSpeed={s.setSpeed} onResetView={s.resetView} onExit={onExit} onClose={s.closePanel} />
                    )}
                    <StatsPanel open={s.ui.panel === 'stats'} snap={s.snap} selectedId={s.selectedId} onPick={pickOnMap} onClose={s.closePanel} />

                    {!s.ui.panel && !s.ui.breachGame && <DilemmaModal dilemma={s.snap.dilemma} onChoose={s.choose} />}
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
