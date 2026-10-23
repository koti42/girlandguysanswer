import React, { useCallback, useEffect } from 'react';
import PanelShell from './PanelShell.jsx';
import {
  Bar, BatteryControls, ButtonControls, DrillControls, FurnaceControls, GeneratorControls, InfoControls, LampControls, LiftControls, PowerSwitch, SensorControls, TeleporterControls,
} from './MachineControls.jsx';
import { useApiSnapshot, useLiveMessage } from './panelHooks.js';
import { formatEU, formatRate, machineState, networkView } from './panelTechUtils.js';
import './panelsTech.css';

const POLL_MS = 250;

/** Türe göre kontrol bölümü (bileşen değişkeni üretmeden doğrudan JSX). */
function renderControls(info, act, config) {
  const p = { info, act, config };
  switch (info.type) {
    case 'jenerator': return <GeneratorControls {...p} />;
    case 'ocak': return <FurnaceControls {...p} />;
    case 'matkap': return <DrillControls {...p} />;
    case 'isinlayici': return <TeleporterControls {...p} />;
    case 'asansor': return <LiftControls {...p} />;
    case 'pil':
    case 'sarj': return <BatteryControls {...p} />;
    case 'dugme': return <ButtonControls {...p} />;
    case 'sensor': return <SensorControls {...p} />;
    case 'lamba': return <LampControls {...p} />;
    default: return <InfoControls {...p} />;
  }
}

const TONE = { good: 'is-good', bad: 'is-bad', dim: 'is-dim' };

/*
 * Makine paneli (Teknoloji): enerji ağı özeti (depo çubuğu, üretim/tüketim), türe özel kontroller (yakıt/ocak yuvaları, ilerleme halkası,
 * madenci modu ve tamponu, ışınlayıcı frekansı, asansör yönü, düğme/sensör ayarı) ve durum etiketi. Makine paneli açıkken ≈ 4 Hz yenilenir.
 * Props: api (getMachineInfo, machineAction, setMachineConfig), onClose, version, accessibility, reducedMotion.
 * Kural: ağdaki tüm değerler EU (enerji birimi); yalnız macera modunda açılır. Renk + metin/şekil birlikte kullanılır.
 */
const MachinePanel = ({
  api, onClose, version = 0, accessibility = false, reducedMotion = false,
}) => {
  const read = useCallback(() => api.getMachineInfo(), [api]);
  const [info, bump] = useApiSnapshot(read, version);
  const [msg, announce] = useLiveMessage();

  useEffect(() => {
    const t = setInterval(bump, POLL_MS);
    return () => clearInterval(t);
  }, [bump]);

  const act = useCallback((a) => {
    if (!info) return null;
    const r = api.machineAction(info.pos.x, info.pos.y, info.pos.z, a);
    announce(r && r.message ? r.message : r && r.ok ? 'Tamam.' : 'Yapılamadı.');
    bump();
    return r;
  }, [api, info, announce, bump]);

  const config = useCallback((cfg) => {
    if (!info) return null;
    const r = api.setMachineConfig(info.pos.x, info.pos.y, info.pos.z, cfg);
    if (r && !r.ok && r.message) announce(r.message);
    else if (r && r.ok && cfg && cfg.off !== undefined) announce(cfg.off ? 'Makine kapatıldı.' : 'Makine açıldı.');
    else if (r && r.ok && cfg && cfg.hue !== undefined) announce('Lamba rengi değişti.');
    bump();
    return r;
  }, [api, info, announce, bump]);

  const st = machineState(info);
  const nw = networkView(info);

  return (
    <PanelShell
      title={info ? info.name : 'Makine'}
      subtitle={info ? `${st.text}${info.powered ? ' · enerji var' : ''}` : ''}
      onClose={onClose}
      testId="machine-panel"
      className="kp-machine"
      size="md"
      accessibility={accessibility}
      reducedMotion={reducedMotion}
      headerExtra={info ? <span className={`km-state ${TONE[st.tone] || ''}`} data-testid="machine-state" data-state={st.key}>{st.text}</span> : null}
    >
      {!info ? (
        <p className="kp-empty" data-testid="machine-closed">Açık bir makine yok. Bir makineye yaklaşıp sağ tıkla.</p>
      ) : (
        <div className="km-layout">
          <section className="km-net" aria-label="Enerji ağı" data-testid="machine-network" data-level={nw.level}>
            <h3 className="kp-h3">Enerji ağı</h3>
            {nw.has ? (
              <>
                {nw.cap > 0 ? <Bar value={nw.stored} max={nw.cap} label="Depo" tone="accent" testId="net-store" /> : <p className="km-note">Ağda pil yok: enerji anlık harcanır.</p>}
                <dl className="km-stats km-stats-net">
                  <div><dt>Üretim</dt><dd data-testid="net-gen">{formatRate(nw.gen).replace('+', '')}</dd></div>
                  <div><dt>Tüketim</dt><dd data-testid="net-use">{nw.supplied} EU/sn</dd></div>
                  <div><dt>Fark</dt><dd data-testid="net-net" className={nw.net < 0 ? 'is-bad' : 'is-good'}>{formatRate(nw.net)}</dd></div>
                </dl>
                <p className={`km-net-text km-net-${nw.level}`} role="status">
                  <span aria-hidden="true">{nw.level === 'ok' ? '✓' : '!'}</span> {nw.text}
                </p>
                <p className="km-note">{nw.nodes} blok · {nw.machines} makine{nw.cap > 0 ? ` · kapasite ${formatEU(nw.cap)}` : ''}</p>
              </>
            ) : (
              <p className="km-note" data-testid="net-none">{nw.text}</p>
            )}
          </section>
          <section className="km-main" aria-label={info.name}>
            {typeof info.off === 'boolean' ? <PowerSwitch info={info} config={config} /> : null}
            {renderControls(info, act, config)}
          </section>
        </div>
      )}
      <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
    </PanelShell>
  );
};

export default MachinePanel;
