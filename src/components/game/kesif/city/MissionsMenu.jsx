import React, {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
import { MEDAL_SHAPES, medalText, timeText } from './missionUtils.js';
import './missions.css';

/*
 * Duraklatma menüsü «Görevler» sayfası (Neon Meridyen): etkin görev (+ bırak), hikâye görevleri, 8 yarış (en iyi süre, madalya, «Yarışa git»), keşif sayaçları ve
 * koleksiyonlar, başarımlar, jeton ödülleri (yalnız giriş yapılmışsa görünür). Üst çerçeve (başlık, geri, Tamam) PauseMenu'dedir.
 *
 * Props: api ({getMissionInfo, abandonMission, startRace}), onResume (yarış hazırlanınca oyuna dön), onBack
 */
const STATE_TEXT = Object.freeze({ done: '✓ Tamamlandı', active: '▶ Sürüyor', locked: '✕ Kilitli' });
const CLAIM_TEXT = Object.freeze({ alindi: '✓ Alındı', bekliyor: '… Sunucuya gönderiliyor', kilitli: '○ Henüz değil' });

const Bar = ({ value, max, label }) => {
  const p = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  return (
    <span className="kmm-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
      <span style={{ width: p + '%' }} />
    </span>
  );
};

const MissionsMenu = ({
  api, onResume, pollMs = 1000,
}) => {
  const [msg, setMsg] = useState('');
  const readRaw = useCallback(() => {
    try {
      return api && typeof api.getMissionInfo === 'function' ? api.getMissionInfo() : null;
    } catch {
      return null;
    }
  }, [api]);
  const [info, setInfo] = useState(readRaw);
  const last = useRef(info ? JSON.stringify(info) : '');
  const read = useCallback(() => {
    const v = readRaw();
    const k = v ? JSON.stringify(v) : '';
    if (k !== last.current) {
      last.current = k;
      setInfo(v);
    }
  }, [readRaw]);

  useEffect(() => {
    const id = setInterval(read, pollMs);
    return () => clearInterval(id);
  }, [read, pollMs]);

  const abandon = useCallback(() => {
    const r = api && typeof api.abandonMission === 'function' ? api.abandonMission() : null;
    setMsg(r && r.ok ? 'Görevi bıraktın.' : (r && r.message) || '');
    read();
  }, [api, read]);

  const race = useCallback((id) => {
    const r = api && typeof api.startRace === 'function' ? api.startRace(id) : null;
    if (r && r.ok) {
      setMsg('');
      if (onResume) onResume();
    } else setMsg((r && r.message) || 'Yarış şu an başlatılamıyor.');
    read();
  }, [api, onResume, read]);

  if (!info) {
    return <p className="kmm-empty" role="status">Görevler yalnız Neon Meridyen&apos;de görünür.</p>;
  }
  const t = info.tracker && info.tracker.kind && info.tracker.kind !== 'result' ? info.tracker : null;
  const claims = info.claims && info.claims.enabled ? info.claims.items : null;
  return (
    <div className="kmm" data-testid="missions-menu">
      <p className="kmm-kredi" aria-label={'Kredi: ' + info.kredi}><b>{info.kredi}</b> Kredi · Gün {info.day + 1}</p>
      {msg ? <p className="kmm-msg" role="status">{msg}</p> : null}

      <section className="kmm-sec" aria-label="Şu anki görev">
        <h3 className="kmm-h">Şu anki görev</h3>
        {t ? (
          <div className="kmm-card" data-testid="menu-active">
            <p className="kmm-t">{t.title}</p>
            <p className="kmm-d">{t.label}{t.dist ? ' · ' + t.dist + ' m' : ''}</p>
            <button type="button" className="kmm-btn kmm-quiet" onClick={abandon} data-testid="menu-abandon">Görevi bırak</button>
          </div>
        ) : (
          <div className="kmm-card">
            <p className="kmm-d">{info.activeQuest ? info.activeQuest.name + ': ' + info.activeQuest.hint : 'Şu an iş yok. Kurye masasından iş al ya da bir yarışa katıl.'}</p>
          </div>
        )}
      </section>

      <section className="kmm-sec" aria-label="Hikâye görevleri">
        <h3 className="kmm-h">Hikâye görevleri</h3>
        <ul className="kmm-list">
          {info.quests.map((q) => (
            <li key={q.id} className="kmm-card" data-state={q.state} data-testid={'quest-' + q.id}>
              <div className="kmm-row"><span className="kmm-t">{q.title}</span><span className={'kmm-badge kmm-' + q.state}>{STATE_TEXT[q.state]}</span></div>
              <p className="kmm-d">{q.state === 'active' && q.hint ? q.hint : q.desc}</p>
              {q.goal > 1 && q.state !== 'locked' ? <div className="kmm-prog"><Bar value={q.progress} max={q.goal} label={q.title + ' ilerlemesi'} /><span>{q.progress}/{q.goal}</span></div> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="kmm-sec" aria-label="Yarışlar">
        <h3 className="kmm-h">Yarışlar</h3>
        <ul className="kmm-list">
          {info.races.map((r) => (
            <li key={r.id} className="kmm-card" data-testid={'race-' + r.id}>
              <div className="kmm-row"><span className="kmm-t">{r.name}</span><span className="kmm-badge">{medalText(r.medal)}</span></div>
              <p className="kmm-d">
                {r.kind === 'sprint' ? 'Sprint' : r.laps + ' tur'} · {r.gates} kapı · {r.length} m
                {r.bestText ? ' · en iyi ' + r.bestText : ''}
              </p>
              {r.targets ? <p className="kmm-d">{MEDAL_SHAPES[3]} {timeText(r.targets.gold)} · {MEDAL_SHAPES[2]} {timeText(r.targets.silver)} · {MEDAL_SHAPES[1]} {timeText(r.targets.bronze)}</p> : null}
              <button type="button" className="kmm-btn" onClick={() => race(r.id)} disabled={info.busy} aria-label={r.name + ' yarışına git'}>Yarışa git</button>
            </li>
          ))}
        </ul>
        <p className="kmm-d">Yarış için bir araca bin; başlangıç kapısında durunca geri sayım başlar.</p>
      </section>

      {info.discovery ? (
        <section className="kmm-sec" aria-label="Keşifler">
          <h3 className="kmm-h">Keşifler</h3>
          <ul className="kmm-count">
            <li><b>{info.discovery.chips}</b>/{info.discovery.chipsTotal} veri çipi</li>
            <li><b>{info.discovery.graffiti}</b>/{info.discovery.graffitiTotal} grafiti</li>
            <li><b>{info.discovery.rooms}</b>/{info.discovery.roomsTotal} gizli oda</li>
            <li><b>{info.discovery.terminals}</b>/{info.discovery.terminalsTotal} terminal</li>
          </ul>
          <ul className="kmm-list kmm-sets">
            {info.discovery.sets.map((s) => (
              <li key={s.id} className="kmm-card" data-done={s.done ? '1' : '0'}>
                <div className="kmm-row"><span className="kmm-t">{s.name}</span><span className="kmm-badge">{s.done ? '✓ Tamam' : s.have + '/' + s.need}</span></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="kmm-sec" aria-label="Başarımlar">
        <h3 className="kmm-h">Başarımlar · {info.stats.achievements}/{info.achievements.length}</h3>
        <ul className="kmm-list kmm-grid">
          {info.achievements.map((a) => (
            <li key={a.id} className="kmm-card" data-done={a.done ? '1' : '0'} data-testid={'ach-' + a.id}>
              <div className="kmm-row"><span className="kmm-t">{a.done ? '★ ' : '☆ '}{a.name}</span></div>
              <p className="kmm-d">{a.desc}</p>
              {a.text ? <p className="kmm-d">{a.text}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      {claims ? (
        <section className="kmm-sec" aria-label="Jeton ödülleri" data-testid="menu-claims">
          <h3 className="kmm-h">Jeton ödülleri</h3>
          <ul className="kmm-list">
            {claims.map((c) => (
              <li key={c.key} className="kmm-card" data-state={c.state}>
                <div className="kmm-row"><span className="kmm-t">{c.name}</span><span className="kmm-badge">{c.amount} jeton</span></div>
                <p className="kmm-d">{CLAIM_TEXT[c.state]} · {c.hint}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

export default memo(MissionsMenu);
