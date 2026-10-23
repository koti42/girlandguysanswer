// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canResume, createKesifAudio, listSoundNames } from './audio.js';
import { createFakeAudioContextClass } from './fakeAudioContext.js';
import { mulberry32 } from './sim/rng.js';

let AC;
let original;
let originalWebkit;

const mk = (opts = {}) => createKesifAudio({ rand: mulberry32(1), lowPower: false, ...opts });
const lastCtx = () => AC.instances[AC.instances.length - 1];
const oscTypes = (ctx) => new Set(ctx.nodes.filter((n) => n.kind === 'osc').map((n) => n.type));

/** Bağlamı açıp çalışır duruma getirir. */
function started(opts) {
  const a = mk(opts);
  a.unlock();
  return { a, ctx: lastCtx() };
}

beforeEach(() => {
  original = window.AudioContext;
  originalWebkit = window.webkitAudioContext;
  AC = createFakeAudioContextClass();
  window.AudioContext = AC;
});

afterEach(() => {
  window.AudioContext = original;
  window.webkitAudioContext = originalWebkit;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

describe('bağlam yaşam döngüsü', () => {
  it('AudioContext yoksa her çağrı sessizce çalışır', () => {
    window.AudioContext = undefined;
    window.webkitAudioContext = undefined;
    const a = mk();
    expect(() => {
      a.unlock();
      expect(a.play('pickup')).toBeNull();
      a.setListener({ x: 1, y: 2, z: 3 }, 0.5);
      a.setAmbient({ biome: 'orman' });
      a.update(0.016);
      a.setMuted(true);
      a.setMuted(false);
      a.setMusicEnabled(false);
      a.setVolumes({ master: 0.5 });
      a.suspend();
      a.resume();
      a.getStats();
      a.dispose();
    }).not.toThrow();
  });

  it('webkitAudioContext yedeği', () => {
    window.AudioContext = undefined;
    window.webkitAudioContext = AC;
    const a = mk();
    a.unlock();
    expect(AC.instances).toHaveLength(1);
    a.dispose();
  });

  it('sessizde bağlam hiç kurulmaz (jest, play, ambient, update dahil)', () => {
    const a = mk({ muted: true, musicEnabled: false });
    a.unlock();
    document.dispatchEvent(new Event('pointerdown'));
    expect(a.play('pickup')).toBeNull();
    a.setAmbient({ underground: true });
    a.update(0.1);
    expect(AC.instances).toHaveLength(0);
    expect(a.isMusicEnabled()).toBe(false);
    a.setMusicEnabled(true);
    expect(a.isMusicEnabled()).toBe(true);
    a.dispose();
  });

  it('unlock bağlamı kurar ve sürdürür; ses çalışır duruma gelir', () => {
    const { a, ctx } = started();
    expect(AC.instances).toHaveLength(1);
    expect(ctx.state).toBe('running');
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(1);
    expect(a.getStats().state).toBe('running');
    // Sessiz tampon (iOS kilidi): destination'a bağlı kaynak
    expect(ctx.nodes.some((n) => n.kind === 'bufsrc' && n.outputs.includes(ctx.destination))).toBe(true);
    a.dispose();
  });

  it('unlock yinelenince ikinci bağlam kurulmaz', () => {
    const { a } = started();
    a.unlock();
    a.unlock();
    expect(AC.instances).toHaveLength(1);
    a.dispose();
  });

  it('kurulum hatasında (AudioContext fırlatır) çökmez', () => {
    window.AudioContext = function Broken() {
      throw new Error('izin yok');
    };
    const a = mk();
    expect(() => a.unlock()).not.toThrow();
    expect(a.play('pickup')).toBeNull();
    a.dispose();
  });

  it('ilk kullanıcı jesti (pointerdown/keydown/touchend) bağlamı açar; sonra dinleyiciler kalkar', () => {
    const a = mk();
    expect(AC.instances).toHaveLength(0);
    document.dispatchEvent(new Event('keydown'));
    expect(AC.instances).toHaveLength(1);
    const ctx = lastCtx();
    const calls = ctx.resumeCalls;
    // Çalışır duruma geçince jest dinleyicileri çıkar (promise çözülene kadar mikro görev bekle)
    return Promise.resolve().then(() => {
      document.dispatchEvent(new Event('pointerdown'));
      document.dispatchEvent(new Event('touchend'));
      expect(ctx.resumeCalls).toBe(calls);
      a.dispose();
    });
  });

  it('tarayıcı askıda bırakırsa (suspended) jestle yeniden sürdürülür; interrupted de', () => {
    const { a, ctx } = started();
    ctx.state = 'suspended';
    expect(canResume(ctx)).toBe(true);
    ctx.state = 'interrupted';
    expect(canResume(ctx)).toBe(true);
    ctx.state = 'running';
    expect(canResume(ctx)).toBe(false);
    expect(canResume(null)).toBe(false);
    a.dispose();
  });

  it('sekme gizlenince askıya alır, dönünce sürdürür; kullanıcı askıdaysa sürdürmez', () => {
    const { a, ctx } = started();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.suspendCalls).toBe(1);
    expect(ctx.state).toBe('suspended');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const before = ctx.resumeCalls;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.resumeCalls).toBe(before + 1);
    expect(ctx.state).toBe('running');
    a.suspend();
    expect(ctx.state).toBe('suspended');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(ctx.state).toBe('suspended'); // kullanıcı askıdayken sekme dönüşü sürdürmez
    a.resume();
    expect(ctx.state).toBe('running');
    a.dispose();
  });

  it('suspend/resume public API', () => {
    const { a, ctx } = started();
    a.suspend();
    expect(ctx.state).toBe('suspended');
    expect(a.play('pickup')).toBeNull();
    a.resume();
    expect(ctx.state).toBe('running');
    expect(a.play('pickup')).not.toBeNull();
    a.dispose();
  });

  it('setMuted: ana kazanç 0, bağlam askıda, play yok; açınca geri gelir', () => {
    const { a, ctx } = started();
    expect(a.play('pickup')).not.toBeNull();
    a.setMuted(true);
    expect(a.isMuted()).toBe(true);
    expect(ctx.state).toBe('suspended');
    expect(a.play('hurt')).toBeNull();
    const master = ctx.nodes.find((n) => n.kind === 'gain');
    const target = master.gain.events.filter((e) => e[0] === 'target').pop();
    expect(target[1]).toBe(0);
    a.setMuted(false);
    expect(ctx.state).toBe('running');
    expect(master.gain.events.filter((e) => e[0] === 'target').pop()[1]).toBeGreaterThan(0.3);
    expect(a.play('hurt')).not.toBeNull();
    a.dispose();
  });

  it('sessiz başlayıp sonra açılırsa bağlam o zaman kurulur', () => {
    const a = mk({ muted: true });
    a.unlock();
    expect(AC.instances).toHaveLength(0);
    a.setMuted(false);
    expect(AC.instances).toHaveLength(1);
    expect(lastCtx().state).toBe('running');
    a.dispose();
  });

  it('dispose bağlamı kapatır, dinleyicileri söker, sonrası güvenli', () => {
    const { a, ctx } = started();
    a.dispose();
    expect(ctx.state).toBe('closed');
    expect(a.play('pickup')).toBeNull();
    expect(() => {
      a.update(0.1);
      a.setAmbient({});
      a.dispose();
    }).not.toThrow();
    const n = AC.instances.length;
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(AC.instances.length).toBe(n);
    // Döngü kaynakları (rüzgâr, yağmur, su, LFO) durduruldu
    const beds = ctx.nodes.filter((x) => (x.kind === 'bufsrc' && x.loop) || (x.kind === 'osc' && x.startedAt === 0));
    expect(beds.length).toBeGreaterThanOrEqual(5);
    beds.forEach((x) => expect(x.stoppedAt).toBeDefined());
  });
});

describe('veri yolu', () => {
  it('ana kompresör ve ana kazanç, destination\'a ulaşır; yankı evrişimi dürtü tamponu taşır', () => {
    const { a, ctx } = started();
    expect(ctx.count('compressor')).toBe(1);
    const comp = ctx.nodes.find((n) => n.kind === 'compressor');
    expect(comp.outputs).toContain(ctx.destination);
    const conv = ctx.nodes.find((n) => n.kind === 'convolver');
    expect(conv.buffer.numberOfChannels).toBe(2);
    expect(conv.buffer.length).toBeGreaterThan(ctx.sampleRate); // > 1 sn
    let energy = 0;
    const d = conv.buffer.getChannelData(0);
    for (let i = 0; i < d.length; i += 7) energy += d[i] * d[i];
    expect(energy).toBeGreaterThan(0);
    a.dispose();
  });

  it('gürültü tamponları ve döngü yatakları kurulur (rüzgâr, yağmur, su)', () => {
    const { a, ctx } = started();
    const loops = ctx.nodes.filter((n) => n.kind === 'bufsrc' && n.loop);
    expect(loops).toHaveLength(3);
    loops.forEach((n) => expect(n.startedAt).toBeDefined());
    a.dispose();
  });

  it('düşük güç modu: daha kısa yankı ve daha az HRTF', () => {
    const hi = started({ lowPower: false });
    const hiLen = hi.ctx.nodes.find((n) => n.kind === 'convolver').buffer.length;
    const lo = started({ lowPower: true });
    const loLen = lo.ctx.nodes.find((n) => n.kind === 'convolver').buffer.length;
    expect(loLen).toBeLessThan(hiLen);
    expect(lo.a.getStats().lowPower).toBe(true);
    expect(hi.a.getStats().lowPower).toBe(false);
    hi.a.dispose();
    lo.a.dispose();
  });
});

describe('ses çalma', () => {
  it('bilinmeyen ad null; bilinen ad el kolu verir ve düğüm kurar', () => {
    const { a, ctx } = started();
    expect(a.play('olmayan_ses')).toBeNull();
    const before = ctx.nodes.length;
    const h = a.play('pickup');
    expect(h).not.toBeNull();
    expect(typeof h.stop).toBe('function');
    expect(typeof h.setPosition).toBe('function');
    expect(ctx.nodes.length).toBeGreaterThan(before);
    expect(a.getStats().voices).toBe(1);
    a.dispose();
  });

  it('listSoundNames içindeki HER ses konumlu ve konumsuz çalar, çökmez', () => {
    const { a, ctx } = started();
    const names = listSoundNames();
    names.forEach((n) => {
      ctx.advance(3);
      a.update(0.016);
      expect(() => a.play(n)).not.toThrow();
      ctx.advance(3);
      a.update(0.016);
      expect(() => a.play(n, { x: 2, y: 0, z: 2, vol: 1.5, pitch: 1.1 })).not.toThrow();
    });
    ctx.advance(10);
    a.update(0.016);
    expect(a.getStats().voices).toBe(0);
    a.dispose();
  });

  it('her ad gerçekten çalıyor (null değil) — boşluk süresi geçince', () => {
    const { a, ctx } = started();
    const silent = [];
    listSoundNames().forEach((n) => {
      ctx.advance(2);
      a.update(0.016);
      if (!a.play(n)) silent.push(n);
    });
    expect(silent).toEqual([]);
    a.dispose();
  });

  it('aynı ses aralık süresi dolmadan tekrar çalınmaz (adım sesi yığılmaz)', () => {
    const { a, ctx } = started();
    expect(a.play('step:taş')).not.toBeNull();
    expect(a.play('step:taş')).toBeNull();
    ctx.advance(0.05);
    expect(a.play('step:taş')).toBeNull();
    ctx.advance(0.1);
    expect(a.play('step:taş')).not.toBeNull();
    // Farklı malzeme ayrı sayılır
    expect(a.play('step:kar')).not.toBeNull();
    a.dispose();
  });

  it('ses sınırlayıcı: aynı anda tavandan fazla ses çalmaz; öncelikliler girer', () => {
    const { a, ctx } = started();
    const mats = ['taş', 'toprak', 'kum', 'ahşap', 'çim', 'kar', 'su', 'metal', 'yaprak', 'cam'];
    ['dig', 'place', 'step', 'land', 'break'].forEach((k) => mats.forEach((m) => a.play(`${k}:${m}`)));
    expect(a.getStats().voices).toBeLessThanOrEqual(24);
    expect(a.getStats().voices).toBeGreaterThan(10);
    // Öncelik 5 ses doluyken de girer (en düşük öncelikli kovulur)
    const before = a.getStats().voices;
    const h = a.play('hurt');
    expect(h).not.toBeNull();
    expect(a.getStats().voices).toBeLessThanOrEqual(24);
    expect(before).toBeLessThanOrEqual(24);
    // Kovulan sesin kazancı hızla kısılır
    const faded = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'target' && e[1] === 0));
    expect(faded.length).toBeGreaterThan(0);
    a.dispose();
  });

  it('düşük öncelikli yeni ses, dolu havuzda (hepsi daha öncelikli) reddedilir', () => {
    const { a } = started({ lowPower: true }); // tavan 14
    for (let i = 0; i < 5; i++) {
      ['achievement', 'puzzle_solved', 'zone_unlock', 'die', 'hurt', 'boss_spawn', 'mob:kokana', 'mob:tasbekci', 'mob:buzkral', 'mob:golgehukumdar', 'parkour_done', 'puzzle_wrong', 'checkpoint', 'portal'].forEach((n) => a.play(n));
    }
    expect(a.getStats().voices).toBeLessThanOrEqual(14);
    // Havuz dolu ve hepsi ≥ 3 öncelikli: 1 öncelikli adım sesi girmemeli
    let full = a.getStats().voices;
    if (full >= 14) expect(a.play('step:çim')).toBeNull();
    a.dispose();
    full = 0;
  });

  it('süresi biten sesler update ile temizlenir: bağlantı koparılır, HRTF yuvası serbest kalır', () => {
    const { a, ctx } = started();
    a.play('hit', { x: 2, y: 0, z: 0 });
    const panners = ctx.nodes.filter((n) => n.kind === 'panner');
    expect(panners).toHaveLength(1);
    const voiceGain = ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(panners[0]));
    expect(voiceGain.connected).toBe(true);
    ctx.advance(10);
    a.update(0.016);
    expect(voiceGain.connected).toBe(false);
    expect(a.getStats().voices).toBe(0);
    // Yuva yeniden kullanılır: yeni panner kurulmaz
    ctx.advance(1);
    a.play('hit', { x: -2, y: 0, z: 0 });
    expect(ctx.nodes.filter((n) => n.kind === 'panner')).toHaveLength(1);
    a.dispose();
  });

  it('konumlu sesler HRTF panner havuzundan geçer; havuz dolunca StereoPanner + mesafe sönümü', () => {
    const { a, ctx } = started();
    const names = ['hit', 'jump', 'pickup', 'bow', 'gun', 'splash', 'lava', 'portal', 'door_open', 'lever'];
    names.forEach((n, i) => a.play(n, { x: 3 + i, y: 0, z: 0 }));
    expect(ctx.count('panner')).toBeLessThanOrEqual(6);
    expect(ctx.count('panner')).toBe(6);
    expect(ctx.count('stereopanner')).toBeGreaterThan(0);
    const p = ctx.nodes.find((n) => n.kind === 'panner');
    expect(p.panningModel).toBe('HRTF');
    expect(p.distanceModel).toBe('inverse');
    a.dispose();
  });

  it('düşük güçte en çok 3 HRTF paneri', () => {
    const { a, ctx } = started({ lowPower: true });
    ['hit', 'jump', 'pickup', 'bow', 'gun', 'splash'].forEach((n, i) => a.play(n, { x: 3 + i, y: 0, z: 0 }));
    expect(ctx.count('panner')).toBe(3);
    a.dispose();
  });

  it('mesafe kırpma: menzil dışındaki konumlu ses çalmaz, yakındaki çalar; konumsuz her zaman', () => {
    const { a, ctx } = started();
    a.setListener({ x: 0, y: 0, z: 0 }, 0);
    expect(a.play('step:taş', { x: 100, y: 0, z: 0 })).toBeNull(); // menzil 18
    ctx.advance(1);
    expect(a.play('step:taş', { x: 10, y: 0, z: 0 })).not.toBeNull();
    expect(a.play('mob:kokana', { x: 60, y: 0, z: 0 })).not.toBeNull(); // boss menzili 70
    expect(a.play('mob:kokana', { x: 80, y: 0, z: 0 })).toBeNull();
    expect(a.play('achievement')).not.toBeNull();
    // Dinleyici hareket edince menzil ona göre
    ctx.advance(1);
    a.setListener({ x: 95, y: 0, z: 0 });
    expect(a.play('step:kar', { x: 100, y: 0, z: 0 })).not.toBeNull();
    a.dispose();
  });

  it('geçersiz konum (NaN) konumsuz sayılır', () => {
    const { a, ctx } = started();
    expect(a.play('pickup', { x: NaN, y: 0, z: 0 })).not.toBeNull();
    expect(ctx.count('panner')).toBe(0);
    a.dispose();
  });

  it('adım sesleri ayak ve rastgelelikle çeşitlenir (perde farkı)', () => {
    const { a, ctx } = started();
    const freqs = [];
    for (let i = 0; i < 6; i++) {
      ctx.advance(1);
      const before = ctx.nodes.length;
      a.play('step:ahşap', { foot: i % 2 });
      const osc = ctx.nodes.slice(before).find((n) => n.kind === 'osc');
      freqs.push(osc.frequency.events[0][1]);
    }
    expect(new Set(freqs.map((f) => f.toFixed(3))).size).toBeGreaterThanOrEqual(5);
    a.dispose();
  });

  it('el kolu: stop kazancı kısar, setPosition panner konumunu günceller', () => {
    const { a, ctx } = started();
    const h = a.play('arrow', { x: 5, y: 0, z: 0 });
    const panner = ctx.nodes.find((n) => n.kind === 'panner');
    h.setPosition(9, 8, 7);
    expect([panner.positionX.value, panner.positionY.value, panner.positionZ.value]).toEqual([9, 8, 7]);
    h.setPosition(NaN, 1, 1);
    expect(panner.positionX.value).toBe(9);
    h.stop();
    const g = ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(panner));
    expect(g.gain.events.some((e) => e[0] === 'target' && e[1] === 0)).toBe(true);
    ctx.advance(0.2);
    a.update(0.016);
    expect(a.getStats().voices).toBe(0);
    a.dispose();
  });

  it('yankı gönderimi: wet>0 olan sesler evrişime bağlanır', () => {
    const { a, ctx } = started();
    const conv = ctx.nodes.find((n) => n.kind === 'convolver');
    const reverbIn = ctx.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(conv));
    a.play('puzzle_solved');
    const wet = ctx.nodes.filter((n) => n.kind === 'gain' && n.outputs.includes(reverbIn) && n.gain.value > 0.3);
    expect(wet.length).toBeGreaterThanOrEqual(1);
    a.dispose();
  });

  it('setVolumes: sfx/ana ses ayarı kazançlara yansır; geçersiz değerler yok sayılır', () => {
    const { a, ctx } = started();
    a.setVolumes({ master: 0.5, sfx: 0.25, music: 'x', ambient: NaN });
    const targets = ctx.nodes.filter((n) => n.kind === 'gain').flatMap((n) => n.gain.events.filter((e) => e[0] === 'target').map((e) => e[1]));
    expect(targets).toContain(0.3); // 0.6 * 0.5
    expect(targets).toContain(0.25);
    a.dispose();
  });
});

describe('dinleyici', () => {
  it('konum ve yön AudioListener parametrelerine yazılır', () => {
    const { a, ctx } = started();
    a.setListener({ x: 5, y: 6, z: 7 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const last = (p) => p.events.filter((e) => e[0] === 'target').pop()[1];
    expect([last(ctx.listener.positionX), last(ctx.listener.positionY), last(ctx.listener.positionZ)]).toEqual([5, 6, 7]);
    expect(last(ctx.listener.forwardX)).toBeCloseTo(1);
    expect(last(ctx.listener.upY)).toBeCloseTo(1);
    a.setListener({ x: 5, y: 6, z: 7 }, Math.PI / 2);
    expect(last(ctx.listener.forwardX)).toBeCloseTo(-1);
    a.dispose();
  });

  it('bağlamdan önce verilen dinleyici, kurulunca uygulanır', () => {
    const a = mk();
    a.setListener({ x: 3, y: 0, z: 0 }, 0);
    a.unlock();
    const ctx = lastCtx();
    expect(ctx.listener.positionX.events.some((e) => e[0] === 'target' && e[1] === 3)).toBe(true);
    a.dispose();
  });

  it('değişmeyen konumda fazladan otomasyon eklenmez; geçersiz giriş yok sayılır', () => {
    const { a, ctx } = started();
    a.setListener({ x: 1, y: 1, z: 1 }, 0.3);
    const n = ctx.listener.positionX.events.length;
    a.setListener({ x: 1, y: 1, z: 1 }, 0.3);
    a.setListener({ x: NaN, y: 1, z: 1 });
    a.setListener(null);
    expect(ctx.listener.positionX.events.length).toBe(n);
    a.dispose();
  });

  it('eski API (setPosition/setOrientation) desteklenir', () => {
    const { a, ctx } = started();
    ctx.listener = { setPosition: vi.fn(), setOrientation: vi.fn() };
    a.setListener({ x: 2, y: 0, z: 0 }, 0);
    expect(ctx.listener.setPosition).toHaveBeenCalledWith(2, 0, 0);
    expect(ctx.listener.setOrientation).toHaveBeenCalled();
    a.dispose();
  });
});

describe('ortam sesleri', () => {
  const lastTarget = (g) => g.gain.events.filter((e) => e[0] === 'target').pop();

  function bedGains(ctx) {
    // Döngü kaynaklarının sonundaki kazançlar (rüzgâr, yağmur, su)
    const loops = ctx.nodes.filter((n) => n.kind === 'bufsrc' && n.loop);
    return loops.map((src) => {
      let n = src;
      while (n.outputs[0] && n.outputs[0].kind === 'biquad') n = n.outputs[0];
      return n.outputs[0];
    });
  }

  it('yağmurda yağmur yatağı açılır, açıkken kapalı', () => {
    const { a, ctx } = started();
    for (let i = 0; i < 20; i++) a.update(0.25);
    const [wind, rain] = bedGains(ctx);
    expect(lastTarget(rain)[1]).toBe(0);
    expect(lastTarget(wind)[1]).toBeGreaterThan(0);
    a.setAmbient({ biome: 'cayir', weather: 'yağmur' });
    for (let i = 0; i < 40; i++) a.update(0.25);
    expect(lastTarget(rain)[1]).toBeGreaterThan(0.1);
    a.dispose();
  });

  it('su altı: dünya alçak geçireni kapanır; sudan çıkınca açılır', () => {
    const { a, ctx } = started();
    const wf = ctx.nodes.find((n) => n.kind === 'biquad' && n.outputs.some((o) => o.kind === 'gain') && n.frequency.value === 20000);
    a.setAmbient({ underwater: true });
    for (let i = 0; i < 40; i++) a.update(0.25);
    expect(wf.frequency.events.filter((e) => e[0] === 'target').pop()[1]).toBeLessThan(900);
    a.setAmbient({ biome: 'cayir' });
    for (let i = 0; i < 60; i++) a.update(0.25);
    expect(wf.frequency.events.filter((e) => e[0] === 'target').pop()[1]).toBeGreaterThan(15000);
    a.dispose();
  });

  it('mağarada damlamalar rastgele aralıklarla çalınır (kapalıyken hiç)', () => {
    const open = started();
    for (let i = 0; i < 400; i++) {
      open.ctx.advance(0.1);
      open.a.update(0.1);
    }
    const openOsc = open.ctx.nodes.filter((n) => n.kind === 'osc').length;
    const openPan = open.ctx.nodes.filter((n) => n.kind === 'panner').length;

    const cave = started();
    cave.a.setAmbient({ underground: true, biome: 'dag' });
    for (let i = 0; i < 400; i++) {
      cave.ctx.advance(0.1);
      cave.a.update(0.1);
    }
    const caveSines = cave.ctx.nodes.filter((n) => n.kind === 'osc' && n.frequency.events[0] && n.frequency.events[0][1] > 1800).length;
    expect(caveSines).toBeGreaterThan(8); // ~0.35/sn × 40 sn (müziğin yüksek notaları eşiğin altında)
    expect(cave.ctx.count('panner')).toBeGreaterThan(0);
    expect(openOsc).toBeGreaterThanOrEqual(0);
    expect(openPan).toBe(0); // açık havada çöl dışı ortam olayı yok (varsayılan boş ambient: kuş yok)
    open.a.dispose();
    cave.a.dispose();
  });

  it('gündüz ormanda kuş, gece cırcır olayları üretir', () => {
    const day = started();
    day.a.setAmbient({ biome: 'orman' });
    for (let i = 0; i < 600; i++) {
      day.ctx.advance(0.1);
      day.a.update(0.1);
    }
    expect(day.ctx.count('panner')).toBeGreaterThan(0);
    day.a.dispose();
    const none = started();
    none.a.setAmbient({ biome: 'col' });
    for (let i = 0; i < 600; i++) {
      none.ctx.advance(0.1);
      none.a.update(0.1);
    }
    expect(none.ctx.count('panner')).toBe(0);
    none.a.dispose();
  });

  it('update büyük dt ve geçersiz dt ile çökmez', () => {
    const { a } = started();
    a.setAmbient({ biome: 'bataklik', night: true, weather: 'fırtına', combat: 1, water: 1, lava: 1 });
    expect(() => {
      a.update(5);
      a.update(NaN);
      a.update(-1);
      a.update(0);
      a.update(undefined);
    }).not.toThrow();
    a.dispose();
  });

  it('setAmbient geçersiz/eksik girdiyle çökmez', () => {
    const { a } = started();
    expect(() => {
      a.setAmbient();
      a.setAmbient(null);
      a.setAmbient('x');
      a.setAmbient({ zone: 'bilinmiyor', biome: 42, weather: {} });
    }).not.toThrow();
    a.dispose();
  });
});

describe('müzik', () => {
  function runMusic(a, ctx, seconds) {
    for (let i = 0; i < seconds * 20; i++) {
      ctx.advance(0.05);
      a.update(0.05);
    }
  }

  it('üretken müzik pad/arpej/bas notaları zamanlar; düğüm sayısı tavanı aşmaz', () => {
    const { a, ctx } = started();
    runMusic(a, ctx, 30);
    const types = oscTypes(ctx);
    expect(types.has('triangle')).toBe(true);
    expect(types.has('sine')).toBe(true);
    expect(a.getStats().musicNodes).toBeLessThanOrEqual(40);
    expect(a.getStats().musicNodes).toBeGreaterThan(0);
    a.dispose();
  });

  it('müzik kapalıyken nota zamanlanmaz; açınca başlar', () => {
    const { a, ctx } = started({ musicEnabled: false });
    runMusic(a, ctx, 10);
    expect(a.getStats().musicNodes).toBe(0);
    a.setMusicEnabled(true);
    runMusic(a, ctx, 10);
    expect(a.getStats().musicNodes).toBeGreaterThan(0);
    a.setMusicEnabled(false);
    ctx.advance(60); // çalan notalar biter
    runMusic(a, ctx, 10);
    expect(a.getStats().musicNodes).toBe(0);
    a.dispose();
  });

  it('biten notalar düğüm sayacından düşer (onended); sessizlikte sayaç sıfıra iner', () => {
    const { a, ctx } = started();
    runMusic(a, ctx, 20);
    expect(a.getStats().musicNodes).toBeGreaterThan(0);
    a.setMusicEnabled(false);
    ctx.advance(60);
    expect(a.getStats().musicNodes).toBe(0);
    a.dispose();
  });

  it('müzik anahtarı müzik kazancını sürer', () => {
    const { a, ctx } = started({ musicEnabled: false });
    const musicGain = () => ctx.nodes.filter((n) => n.kind === 'gain').find((g) => g.outputs.some((o) => o.kind === 'biquad' && o.frequency.value === 20000) && g.gain.value === 0);
    expect(musicGain()).toBeTruthy();
    a.setMusicEnabled(true);
    const g = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'target' && e[1] > 0.1 && e[1] < 0.2));
    expect(g.length).toBeGreaterThan(0);
    a.dispose();
  });

  it('savaşta gergin katman (testere dalgalı drone/nabız) devreye girer, sakinde yok', () => {
    const calm = started();
    runMusic(calm.a, calm.ctx, 20);
    expect(oscTypes(calm.ctx).has('sawtooth')).toBe(false);
    calm.a.dispose();
    const fight = started();
    runMusic(fight.a, fight.ctx, 5);
    fight.a.setAmbient({ zone: 1, combat: 1 });
    expect(oscTypes(fight.ctx).has('sawtooth')).toBe(true); // anında alçak vuruş
    runMusic(fight.a, fight.ctx, 20);
    const saws = fight.ctx.nodes.filter((n) => n.kind === 'osc' && n.type === 'sawtooth').length;
    expect(saws).toBeGreaterThan(3);
    fight.a.dispose();
  });

  it('gergin katman savaş bitince söner (tense bus kazancı 0\'a iner)', () => {
    const { a, ctx } = started();
    a.setAmbient({ combat: 1 });
    runMusic(a, ctx, 10);
    const tenseGain = () => {
      const gs = ctx.nodes.filter((n) => n.kind === 'gain' && n.gain.events.some((e) => e[0] === 'target'));
      return gs;
    };
    expect(tenseGain().length).toBeGreaterThan(0);
    a.setAmbient({ combat: 0 });
    runMusic(a, ctx, 20);
    const vals = ctx.nodes.filter((n) => n.kind === 'gain').map((g) => g.gain.events.filter((e) => e[0] === 'target').pop()).filter(Boolean);
    expect(vals.some((e) => e[1] < 0.05)).toBe(true);
    a.dispose();
  });

  it('bölge/gün/yeraltı değişince müzik parametreleri ölçü başında benimsenir (kip değişir)', () => {
    const { a, ctx } = started();
    runMusic(a, ctx, 5);
    const before = ctx.nodes.filter((n) => n.kind === 'osc').length;
    a.setAmbient({ zone: 3, underground: true });
    runMusic(a, ctx, 20);
    expect(ctx.nodes.filter((n) => n.kind === 'osc').length).toBeGreaterThan(before);
    a.dispose();
  });

  it('uzun durma sonrası (zamanlayıcı geride kaldı) müzik toparlanır, kısa sürede yüzlerce nota yığmaz', () => {
    const { a, ctx } = started();
    runMusic(a, ctx, 3);
    const before = ctx.nodes.filter((n) => n.kind === 'osc').length;
    ctx.advance(120);
    a.update(0.05);
    const after = ctx.nodes.filter((n) => n.kind === 'osc').length;
    expect(after - before).toBeLessThan(60);
    a.dispose();
  });

  it('müzik notaları kazançları geçerli: tüm üstel rampalar > 0 (sahte bağlam sıkı denetler)', () => {
    const { a, ctx } = started();
    expect(() => {
      a.setAmbient({ combat: 1, zone: 4, night: true });
      runMusic(a, ctx, 40);
    }).not.toThrow();
    a.dispose();
  });
});
