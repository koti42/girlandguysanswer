import React, { memo } from 'react';
import { LuSkull } from 'react-icons/lu';
import { bossPhase, clamp } from './kxHudUtils.js';

/**
 * Boss barı: ad, can çubuğu (beyaz "gecikmeli" iz: son hasarı gösterir), aşama noktaları. Aşama eşikleri
 * çubuk üzerinde işaretlidir. Renk + sayı + metin (renk körü dostu). `phases` varsayılan 3.
 */
const BossBar = ({ boss, phases = 3 }) => {
  if (!boss) return null;
  const maxHp = boss.maxHp > 0 ? boss.maxHp : 1;
  const frac = clamp(boss.hp / maxHp, 0, 1);
  const pctNow = Math.round(frac * 100);
  const phase = bossPhase(boss.hp, maxHp, phases);
  const n = Math.max(1, Math.floor(phases));
  const marks = [];
  for (let i = 1; i < n; i++) marks.push(100 - (i * 100) / n);

  return (
    <section className="kx-boss" data-phase={phase} aria-label={'Boss: ' + boss.name} data-no-tap>
      <p className="kx-sr" role="status">
        {'Boss: ' + boss.name + ', aşama ' + phase + ' / ' + n}
      </p>
      <div className="kx-boss-top" aria-hidden="true">
        <span className="kx-boss-name">
          <LuSkull className="kx-boss-ico" /> {boss.name}
        </span>
        <span className="kx-boss-phase">
          Aşama {phase}/{n}
        </span>
      </div>
      <div
        className="kx-boss-track"
        role="progressbar"
        aria-label={boss.name + ' canı'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pctNow}
        aria-valuetext={'Yüzde ' + pctNow}
      >
        <span className="kx-boss-lag" style={{ width: pctNow + '%' }} />
        <span className="kx-boss-fill" style={{ width: pctNow + '%' }} />
        {marks.map((m) => (
          <span key={m} className="kx-boss-mark" style={{ left: m + '%' }} />
        ))}
      </div>
      <div className="kx-boss-pips" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="kx-boss-pip" data-state={i + 1 < phase ? 'done' : i + 1 === phase ? 'now' : 'next'} />
        ))}
      </div>
    </section>
  );
};

export default memo(BossBar);
