import { describe, expect, it } from 'vitest';
import { createVehicleAudio, playerSourceCount } from './audioVehicle.js';
import { NODE_CAP_BY_TIER, tierPlan } from './audioVehicleMath.js';
import {
  advance, connectedCount, liveSources, makeLoop, makeVehicle,
} from './audioLoopTestKit.js';
import { VEHICLE_CLASSES } from './sim/city/vehicle/vehicleData.js';
import { mulberry32 } from './sim/rng.js';

function rig(cap, cls) {
  const loop = makeLoop();
  const va = createVehicleAudio({ getLoop: () => loop, nodeCap: cap });
  const v = cls ? makeVehicle(cls) : null;
  const st = {
    v, wet: 0, listener: { x: 0, y: 64, z: 0, yaw: 0, vx: 0, vz: 0 }, traffic: [], trafficN: 0,
  };
  return {
    loop, va, v, st, ctx: loop.ctx,
  };
}

const lastTarget = (param) => {
  for (let i = param.events.length - 1; i >= 0; i--) if (param.events[i][0] === 'target') return param.events[i][1];
  return undefined;
};

function cars(n, seed) {
  const r = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: 1000 + i, x: (r() - 0.5) * 120, z: (r() - 0.5) * 120, vx: (r() - 0.5) * 30, vz: (r() - 0.5) * 30,
    });
  }
  return out;
}

describe('createVehicleAudio — bağlam yok / sessiz', () => {
  it('döngü bağlamı yoksa (jest öncesi) hiçbir şey kurulmaz', () => {
    const va = createVehicleAudio({ getLoop: () => null, nodeCap: 24 });
    const v = makeVehicle('taksi');
    for (let i = 0; i < 30; i++) va.update(0.016, { v, wet: 0, listener: { x: 0, z: 0, yaw: 0 }, traffic: cars(5, 1), trafficN: 5 });
    expect(va.event('bump', { impact: 10 })).toBe(false);
    expect(va.getStats().sources).toBe(0);
    expect(va.getStats().running).toBe(false);
  });

  it('getLoop yok / fırlatan getLoop güvenli değil ama undefined güvenli', () => {
    const va = createVehicleAudio({});
    va.update(0.016, { v: makeVehicle('taksi') });
    expect(va.getStats().sources).toBe(0);
  });

  it('loop.running=false (sessiz/gizli sekme): tüm kaynaklar anında bırakılır; dönünce yeniden kurulur', () => {
    const { loop, va, st, ctx } = rig(24, 'spor');
    va.update(0.05, st);
    advance(ctx, 0.2);
    va.update(0.05, st);
    expect(liveSources(ctx)).toBeGreaterThan(3);
    const base = connectedCount(ctx);
    loop.running = false;
    va.update(0.05, st);
    expect(liveSources(ctx)).toBe(0);
    expect(va.getStats().sources).toBe(0);
    expect(va.getStats().player).toBe(false);
    const hidden = connectedCount(ctx);
    expect(hidden).toBeLessThan(base);
    for (let i = 0; i < 20; i++) va.update(0.05, st); // gizliyken hiçbir şey kurulmaz
    expect(liveSources(ctx)).toBe(0);
    loop.running = true;
    va.update(0.05, st);
    advance(ctx, 0.1);
    va.update(0.05, st);
    expect(va.getStats().player).toBe(true);
    expect(liveSources(ctx)).toBeGreaterThan(3);
    expect(va.getStats().sources).toBe(liveSources(ctx));
  });
});

describe('oyuncu motoru', () => {
  it('kademe başına kaynak sayısı: yüksek spor=5 taksi=4, orta taksi=4, düşük taksi=2', () => {
    expect(playerSourceCount('spor', tierPlan(24))).toBe(5);
    expect(playerSourceCount('taksi', tierPlan(24))).toBe(4);
    expect(playerSourceCount('taksi', tierPlan(18))).toBe(4);
    expect(playerSourceCount('taksi', tierPlan(12))).toBe(2);
    expect(playerSourceCount('taksi', tierPlan(10))).toBe(2);
  });

  it('girince motor kurulur, kaynak sayısı = beklenen; çıkınca sönüp tamamen kaybolur', () => {
    const { va, st, ctx } = rig(24, 'spor');
    va.update(0.05, st);
    advance(ctx, 0.5);
    va.update(0.05, st);
    expect(va.getStats().player).toBe(true);
    const persistent = playerSourceCount('spor', tierPlan(24));
    expect(liveSources(ctx)).toBeGreaterThanOrEqual(persistent);
    st.v = null;
    for (let i = 0; i < 40; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    advance(ctx, 1);
    va.update(0.05, st);
    expect(va.getStats().player).toBe(false);
    expect(liveSources(ctx)).toBe(0);
    expect(va.getStats().sources).toBe(0);
  });

  it('rpm → frekans: düğüm üzerinde SIKI tekdüze artan (her sınıf)', () => {
    VEHICLE_CLASSES.forEach((cls) => {
      const { va, st, ctx, v } = rig(24, cls);
      v.throttle = 0.5;
      st.v = v;
      v.rpm = 0.2;
      for (let i = 0; i < 40; i++) {
        va.update(0.05, st);
        advance(ctx, 0.05);
      }
      const n = va.probe().player;
      expect(n).not.toBeNull();
      let prev = -Infinity;
      for (let r = 0; r <= 100; r += 4) {
        v.rpm = r / 100;
        va.update(0.05, st);
        const f = lastTarget(n.saw.frequency);
        expect(f).toBeGreaterThan(prev);
        prev = f;
      }
    });
  });

  it('yük bağımlı tını: yüksek gaz parlaklığı (lowpass) artırır', () => {
    const { va, st, ctx, v } = rig(24, 'taksi');
    v.rpm = 0.6;
    v.throttle = 0.1;
    st.v = v;
    for (let i = 0; i < 40; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    const n = va.probe().player;
    va.update(0.05, st);
    const low = lastTarget(n.lp.frequency);
    v.throttle = 1;
    v.aLong = 10;
    va.update(0.05, st);
    expect(lastTarget(n.lp.frequency)).toBeGreaterThan(low);
  });

  it('kayma, ıslak yol ve rüzgâr kazançları sürüş durumuna bağlı', () => {
    const { va, st, ctx, v } = rig(24, 'taksi');
    st.v = v;
    for (let i = 0; i < 40; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    const n = va.probe().player;
    va.update(0.05, st);
    expect(lastTarget(n.sg.gain)).toBe(0);
    expect(lastTarget(n.hg.gain)).toBe(0);
    v.vx = 0; v.vz = -25; v.skid = 1; st.wet = 1;
    va.update(0.05, st);
    expect(lastTarget(n.sg.gain)).toBeGreaterThan(0.1);
    expect(lastTarget(n.hg.gain)).toBeGreaterThan(0.03);
    expect(lastTarget(n.wg.gain)).toBeGreaterThan(0.05);
    v.nitroOn = true;
    va.update(0.05, st);
    expect(lastTarget(n.ng.gain)).toBeGreaterThan(0.05);
  });

  it('elektrikli sınıf: vızıltı sinüs, turbo hoverbike’ta var, suzulkay’da yok', () => {
    const hb = rig(24, 'hoverbike');
    hb.va.update(0.05, hb.st);
    expect(hb.va.probe().player.saw.type).toBe('sine');
    expect(hb.va.probe().player.tosc).not.toBeNull();
    const sk = rig(24, 'suzulkay');
    sk.va.update(0.05, sk.st);
    expect(sk.va.probe().player.saw.type).toBe('sine');
    expect(sk.va.probe().player.tosc).toBeNull();
    const tx = rig(24, 'taksi');
    tx.va.update(0.05, tx.st);
    expect(tx.va.probe().player.saw.type).toBe('sawtooth');
  });

  it('araç değişimi: eski motor bırakılır, yenisi kurulur', () => {
    const { va, st, ctx } = rig(24, 'taksi');
    va.update(0.05, st);
    const first = va.probe().player;
    st.v = makeVehicle('motor');
    for (let i = 0; i < 20; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    expect(va.probe().player).not.toBe(first);
    expect(va.probe().player.saw.frequency.value).toBeGreaterThan(60);
  });
});

describe('düğüm tavanı (sert)', () => {
  [24, 18, 12, 8, 5, 2, 0].forEach((cap) => {
    it('tavan ' + cap + ': olay fırtınası + 40 trafik aracı + giriş/çıkış — kaynak sayısı hiçbir zaman aşılmaz', () => {
      const { loop, va, st, ctx } = rig(cap, null);
      const r = mulberry32(cap * 31 + 5);
      const types = ['bump', 'scrape', 'land', 'horn', 'door', 'shift', 'hop', 'splash', 'nitroStart', 'driftBoost', 'bilinmeyen'];
      let maxLive = 0;
      let maxKit = 0;
      for (let i = 0; i < 1500; i++) {
        if (i % 37 === 0) st.v = st.v ? null : makeVehicle(VEHICLE_CLASSES[Math.floor(r() * VEHICLE_CLASSES.length)]);
        if (st.v) {
          st.v.rpm = r();
          st.v.throttle = r();
          st.v.skid = r() < 0.3 ? r() : 0;
          st.v.vx = (r() - 0.5) * 40;
          st.v.vz = (r() - 0.5) * 40;
          st.v.hazardT = r() < 0.2 ? 1 : 0;
          st.v.steer = (r() - 0.5) * 2;
        }
        st.traffic = cars(40, i);
        st.trafficN = 40;
        st.listener.x = (r() - 0.5) * 100;
        st.listener.z = (r() - 0.5) * 100;
        va.update(0.02 + r() * 0.04, st);
        const k = 1 + Math.floor(r() * 4);
        for (let j = 0; j < k; j++) va.event(types[Math.floor(r() * types.length)], { impact: r() * 25, soft: r() < 0.3, variant: Math.floor(r() * 4), from: 1, to: 2 });
        advance(ctx, 0.02 + r() * 0.05, 0.02);
        const live = liveSources(ctx);
        maxLive = Math.max(maxLive, live);
        maxKit = Math.max(maxKit, va.getStats().sources);
        expect(live).toBeLessThanOrEqual(cap);
        expect(va.getStats().sources).toBeLessThanOrEqual(cap);
      }
      expect(va.getStats().peak).toBeLessThanOrEqual(cap);
      expect(maxKit).toBeGreaterThanOrEqual(0);
      // sızıntı yok: hepsini bırak
      va.halt();
      expect(liveSources(ctx)).toBe(0);
      expect(loop.ctx).toBe(ctx);
    });
  });

  it('kademe tavanları sabitleri kullanılır (24/18/12) ve oyuncu+trafik+tek atımlık toplamı aşmaz', () => {
    Object.keys(NODE_CAP_BY_TIER).forEach((k) => {
      const cap = NODE_CAP_BY_TIER[k];
      const p = tierPlan(cap);
      expect(p.playerSources + p.traffic * 2 + p.oneShot).toBe(cap);
    });
  });

  it('setNodeCap: düşürünce özellikler kapanır ve yeni tavan aşılmaz', () => {
    const { va, st, ctx } = rig(24, 'spor');
    st.traffic = cars(30, 3);
    st.trafficN = 30;
    for (let i = 0; i < 30; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    expect(va.getStats().trafficVoices).toBe(3);
    va.setNodeCap(12);
    for (let i = 0; i < 40; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
      expect(liveSources(ctx)).toBeLessThanOrEqual(12);
    }
    expect(va.getStats().trafficVoices).toBe(1);
    expect(va.probe().player.tosc).toBeNull();
    expect(va.probe().player.sq).toBeNull();
    va.setNodeCap(24);
    for (let i = 0; i < 40; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    expect(va.getStats().trafficVoices).toBe(3);
    expect(va.probe().player.tosc).not.toBeNull();
  });
});

describe('sızıntı', () => {
  it('1000 bin/in döngüsü: 0 canlı kaynak, 0 sızan düğüm, oluşturulan = bırakılan', () => {
    const { va, st, ctx } = rig(24, null);
    const v = makeVehicle('spor');
    for (let i = 0; i < 20; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    const base = connectedCount(ctx);
    for (let i = 0; i < 1000; i++) {
      st.v = i % 2 === 0 ? makeVehicle(VEHICLE_CLASSES[i % 6]) : null;
      va.update(0.03, st);
      if (i % 3 === 0) va.event('horn', { variant: i % 4 });
      advance(ctx, 0.1, 0.05);
      va.update(0.03, st);
      expect(liveSources(ctx)).toBeLessThanOrEqual(24);
    }
    st.v = null;
    for (let i = 0; i < 40; i++) {
      va.update(0.05, st);
      advance(ctx, 0.1);
    }
    expect(v.cls).toBe('spor');
    expect(liveSources(ctx)).toBe(0);
    expect(va.getStats().sources).toBe(0);
    expect(connectedCount(ctx)).toBe(base);
    const s = va.getStats();
    expect(s.created).toBe(s.released);
    expect(s.groups).toBe(0);
  });

  it('1000 hızlı bin/in (aynı karede) + dispose: sızıntı 0', () => {
    const { va, st, ctx } = rig(18, null);
    const base = connectedCount(ctx);
    for (let i = 0; i < 1000; i++) {
      st.v = makeVehicle('taksi');
      va.update(0.016, st);
      st.v = null;
      va.update(0.016, st);
      advance(ctx, 0.02, 0.02);
    }
    advance(ctx, 2, 0.1);
    va.update(0.016, st);
    va.dispose();
    expect(liveSources(ctx)).toBe(0);
    expect(connectedCount(ctx)).toBe(base);
    expect(va.getStats().sources).toBe(0);
  });
});

describe('trafik sesleri', () => {
  it('havuzlu: sesler yeniden kullanılır (kaynak sayısı sabit), sayı ≤ plan.traffic, uzak araçlar sessiz', () => {
    const { va, st, ctx } = rig(24, null);
    st.traffic = cars(60, 11);
    st.trafficN = 60;
    for (let i = 0; i < 20; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    expect(va.getStats().trafficVoices).toBe(3);
    const created = va.getStats().created;
    for (let i = 0; i < 200; i++) {
      st.traffic = cars(60, 100 + i);
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    expect(va.getStats().created).toBe(created); // havuzlu: yeni düğüm yok
    expect(va.getStats().trafficVoices).toBe(3);
    // hepsi menzil dışı → ses 0
    st.traffic = [{ id: 1, x: 900, z: 900, vx: 0, vz: 0 }, { id: 2, x: -900, z: 5, vx: 0, vz: 0 }];
    st.trafficN = 2;
    va.update(0.05, st);
    va.probe().traffic.forEach((vo) => expect(lastTarget(vo.out.gain)).toBe(0));
  });

  it('yakın araç daha yüksek, sağdaki araç pan > 0, yaklaşan araç perdesi yükselir', () => {
    const { va, st, ctx } = rig(24, null);
    st.listener.yaw = 0;
    st.traffic = [{ id: 7, x: 6, z: 0, vx: 0, vz: 12 }];
    st.trafficN = 1;
    for (let i = 0; i < 6; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    const vo = va.probe().traffic[0];
    const near = lastTarget(vo.out.gain);
    expect(vo.pan).not.toBeNull();
    expect(lastTarget(vo.pan.pan)).toBeGreaterThan(0.5);
    st.traffic = [{ id: 7, x: 40, z: 0, vx: 0, vz: 12 }];
    va.update(0.05, st);
    expect(lastTarget(vo.out.gain)).toBeLessThan(near);
    // yaklaşan (−x yönünde ilerleyen, dinleyici solda) vs uzaklaşan
    st.traffic = [{ id: 7, x: 30, z: 0, vx: -20, vz: 0 }];
    va.update(0.05, st);
    const fApproach = lastTarget(vo.a.frequency);
    st.traffic = [{ id: 7, x: 30, z: 0, vx: 20, vz: 0 }];
    va.update(0.05, st);
    const fRecede = lastTarget(vo.a.frequency);
    expect(fApproach).toBeGreaterThan(fRecede);
  });

  it('trafik verisi bozuksa (NaN, eksik alan) güvenli', () => {
    const { va, st, ctx } = rig(24, null);
    st.traffic = [{ id: 1 }, { id: 2, x: NaN, z: 3 }, null, { id: 3, x: 5, z: 5, vx: NaN, vz: Infinity }];
    st.trafficN = 4;
    expect(() => {
      for (let i = 0; i < 10; i++) {
        va.update(0.05, st);
        advance(ctx, 0.05);
      }
    }).not.toThrow();
  });
});

describe('tek atımlık sesler', () => {
  it('çarpma, korna (4 varyant), kapı, sürtünme, iniş düğüm üretir ve biter', () => {
    const { va, st, ctx } = rig(24, null);
    va.update(0.05, st);
    ['bump', 'scrape', 'land', 'door', 'splash', 'hop', 'nitroStart', 'driftBoost'].forEach((t) => {
      expect(va.event(t, { impact: 12 })).toBe(true);
      advance(ctx, 0.6, 0.05);
    });
    for (let h = 0; h < 4; h++) {
      expect(va.event('horn', { variant: h })).toBe(true);
      advance(ctx, 0.7, 0.05);
    }
    expect(liveSources(ctx)).toBe(0);
    expect(va.event('bilinmeyen', {})).toBe(false);
  });

  it('korna sık basılınca (14 ms) bastırılır, bump kısa aralıkta bastırılır', () => {
    const { va, st } = rig(24, null);
    va.update(0.05, st);
    expect(va.event('horn', { variant: 0 })).toBe(true);
    expect(va.event('horn', { variant: 0 })).toBe(false);
    expect(va.event('bump', { impact: 8 })).toBe(true);
    expect(va.event('bump', { impact: 8 })).toBe(false);
  });

  it('turbo üflemesi yalnız turbolu sınıfta ve vites yukarıyken', () => {
    const sp = rig(24, 'spor');
    sp.va.update(0.05, sp.st);
    expect(sp.va.event('shift', { from: 1, to: 2 })).toBe(true);
    const tx = rig(24, 'taksi');
    tx.va.update(0.05, tx.st);
    expect(tx.va.event('shift', { from: 1, to: 2 })).toBe(false);
  });

  it('bütçe doluyken tek atımlık sessizce düşer, fırlatmaz', () => {
    const { va, st } = rig(3, null);
    va.update(0.05, st);
    let dropped = 0;
    for (let i = 0; i < 30; i++) if (!va.event(['bump', 'land', 'scrape'][i % 3], { impact: 9 })) dropped++;
    expect(dropped).toBeGreaterThan(0);
    expect(va.getStats().sources).toBeLessThanOrEqual(3);
  });

  it('giriş: kapı + kontak sesi; çıkış: kapı sesi (aile dostu, kısa)', () => {
    const { va, st, ctx } = rig(24, 'taksi');
    va.update(0.05, st);
    for (let i = 0; i < 30; i++) {
      va.update(0.03, st);
      advance(ctx, 0.03, 0.03);
    }
    const before = va.getStats().created;
    // oyuncu motoru + kapı aç/kapa (2 × 2 kaynak) + kontak; ısınma düğümleri de sayılır
    expect(before).toBeGreaterThanOrEqual(playerSourceCount('taksi', tierPlan(24)) + 5);
    st.v = null;
    for (let i = 0; i < 10; i++) {
      va.update(0.03, st);
      advance(ctx, 0.03, 0.03);
    }
    expect(va.getStats().created).toBeGreaterThan(before);
  });
});

describe('ısınma ve kurulum yayma', () => {
  it('bağlam ilk çalıştığında araca binmeden sessiz ısınma yapılır: duyulmaz ve temiz biter', () => {
    const { va, st, ctx } = rig(24, null);
    va.update(0.016, st);
    va.update(0.016, st);
    const created = va.getStats().created;
    expect(created).toBeGreaterThan(5); // motor + tek atımlıklar + trafik sesi ısındı
    expect(va.getStats().player).toBe(false);
    // ısınma düğümlerinin hiçbirinin düzeyi duyulur değil
    const peak = Math.max(...ctx.nodes.filter((n) => n.kind === 'gain').flatMap((n) => n.gain.events.filter((e) => e[0] === 'exp').map((e) => e[1])));
    expect(peak).toBeLessThanOrEqual(0.0002);
    advance(ctx, 1, 0.05);
    va.update(0.016, st);
    expect(liveSources(ctx)).toBe(0);
    expect(va.getStats().sources).toBe(0);
    va.update(0.016, st);
    expect(va.getStats().created).toBe(created); // yalnız bir kez ısınır
  });

  it('ilk karede zaten araçtaysa (kayıt yükleme) ısınma atlanır, gerçek motor kurulur', () => {
    const { va, st } = rig(24, 'spor');
    va.update(0.016, st);
    expect(va.getStats().player).toBe(true);
  });

  it('bağlam değişince ısınma yeniden yapılır', () => {
    const { loop, va, st } = rig(24, null);
    va.update(0.016, st);
    va.update(0.016, st);
    const n = va.getStats().created;
    const other = makeLoop();
    loop.ctx = other.ctx;
    loop.sfx = other.sfx;
    loop.white = other.white;
    loop.brown = other.brown;
    va.update(0.016, st);
    va.update(0.016, st);
    expect(va.getStats().created).toBeGreaterThan(n);
  });

  it('biniş kurulumu kareye yayılır: kare başına en çok bir tek atımlık grup + motor', () => {
    const { va, st, ctx } = rig(24, null);
    for (let i = 0; i < 6; i++) {
      va.update(0.03, st);
      advance(ctx, 0.03, 0.03);
    }
    advance(ctx, 1, 0.1);
    va.update(0.03, st);
    st.v = makeVehicle('spor');
    const sources = [];
    for (let i = 0; i < 30; i++) {
      const c0 = va.getStats().created;
      va.update(0.03, st);
      sources.push(va.getStats().created - c0);
      advance(ctx, 0.03, 0.03);
    }
    const max = Math.max(...sources);
    expect(max).toBeLessThanOrEqual(playerSourceCount('spor', tierPlan(24)) + 1);
    expect(sources.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(playerSourceCount('spor', tierPlan(24)) + 3);
  });

  it('kuyruk sınırlı: aynı karede 500 bin/in sonrası yığılma kalmaz', () => {
    const { va, st, ctx } = rig(24, null);
    for (let i = 0; i < 6; i++) {
      va.update(0.03, st);
      advance(ctx, 0.03, 0.03);
    }
    for (let i = 0; i < 500; i++) {
      st.v = i % 2 ? null : makeVehicle('taksi');
      va.update(0.001, st);
    }
    for (let i = 0; i < 60; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05, 0.05);
    }
    advance(ctx, 2, 0.1);
    va.update(0.05, st);
    expect(liveSources(ctx)).toBe(0);
  });
});

describe('trafik kornası (uzamsal)', () => {
  it('yakın araç kornası çalar (pan sağ +), uzak araç çalmaz, sık tekrar bastırılır', () => {
    const { va, st, ctx } = rig(24, null);
    va.update(0.05, st);
    expect(va.event('trafficHonk', { id: 5, x: 15, z: 0 })).toBe(true);
    const horns = ctx.nodes.filter((n) => n.kind === 'stereopanner');
    expect(horns.length).toBeGreaterThan(0);
    expect(horns[horns.length - 1].pan.value).toBeGreaterThan(0.5);
    expect(va.event('trafficHonk', { id: 5, x: 15, z: 0 })).toBe(false);
    advance(ctx, 1, 0.05);
    expect(va.event('trafficHonk', { id: 6, x: 400, z: 0 })).toBe(false);
    expect(va.event('trafficHonk', { id: 7, x: -12, z: -4 })).toBe(true);
    advance(ctx, 1.5, 0.05);
    expect(liveSources(ctx)).toBe(0);
  });

  it('dinleyici henüz bilinmiyorsa (update öncesi) / NaN konumda güvenli', () => {
    const { va, st } = rig(24, null);
    expect(va.event('trafficHonk', { id: 1, x: 1, z: 1 })).toBe(false);
    va.update(0.05, st);
    expect(() => va.event('trafficHonk', { id: NaN, x: NaN, z: undefined })).not.toThrow();
  });

  it('uzak korna daha sessiz (mesafe sönümü)', () => {
    const { va, st, ctx } = rig(24, null);
    va.update(0.05, st);
    const peakOf = (fn) => {
      const n0 = ctx.nodes.length;
      fn();
      return Math.max(...ctx.nodes.slice(n0).filter((x) => x.kind === 'gain').flatMap((x) => x.gain.events.filter((e) => e[0] === 'exp').map((e) => e[1])));
    };
    const near = peakOf(() => va.event('trafficHonk', { id: 1, x: 6, z: 0 }));
    advance(ctx, 1, 0.05);
    const far = peakOf(() => va.event('trafficHonk', { id: 1, x: 55, z: 0 }));
    expect(far).toBeLessThan(near);
    expect(far).toBeGreaterThan(0);
  });
});

describe('sinyal tıkı', () => {
  it('çarpma sonrası dörtlü (hazardT>0) tık üretir; hover/tahta sinyal vermez', () => {
    const { va, st, ctx, v } = rig(24, 'taksi');
    for (let i = 0; i < 20; i++) {
      va.update(0.05, st);
      advance(ctx, 0.05);
    }
    const c0 = va.getStats().created;
    v.hazardT = 2;
    for (let i = 0; i < 80; i++) {
      va.update(0.025, st);
      advance(ctx, 0.025, 0.025);
    }
    const ticks = va.getStats().created - c0;
    expect(ticks).toBeGreaterThanOrEqual(4);
    expect(ticks).toBeLessThan(2 * 2.8 * 3);
    const h = rig(24, 'hoverbike');
    for (let i = 0; i < 20; i++) {
      h.va.update(0.05, h.st);
      advance(h.ctx, 0.05);
    }
    const hc = h.va.getStats().created;
    h.v.hazardT = 2;
    for (let i = 0; i < 80; i++) {
      h.va.update(0.025, h.st);
      advance(h.ctx, 0.025, 0.025);
    }
    expect(h.va.getStats().created).toBe(hc);
  });
});
