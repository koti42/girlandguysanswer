// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem as createPhoto } from './cityPhoto.js';
import { createSystem as createMissions } from './cityMissions.js';
import { createSystem as createNpc } from './cityNpc.js';
import { FAST_TRAVEL } from '../sim/city/map/fastTravel.js';

vi.setConfig({ testTimeout: 240000 });

/*
 * QA4-004: hızlı seyahat "6 sn'de hazır olmazsa başlangıca dön" kuralı SAAT TİKİYLE işliyordu; masaüstü RTX 3060'ta bile uzak köşe terminallerinde (t12: 7+ sn) parçalar
 * ilerliyorken zaman aşımı olup oyuncu geri gönderiliyordu (telefonda neredeyse her uzak seyahat). Düzeltme: zaman aşımı İLERLEME DURAKLAMASINA (6 sn ilerleme yok) bağlı +
 * mutlak üst sınır (FAST_TRAVEL.maxHold = 25 sn); ilerleme sürerken seyahat tamamlanır.
 */
function boot() {
  const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
  const G = kit.G;
  G.vehicles = { driven: null, list: () => [] };
  G.renderer = { domElement: { width: 1280, height: 720 } };
  Object.assign(G.postfx, {
    render() {}, tune() {}, setPhoto() {}, setGrade() {},
  });
  G.character = { root: { visible: false } };
  G.viewModel = { swing() {}, setVisible() {} };
  const npc = createNpc(G);
  const missions = createMissions(G);
  const photo = createPhoto(G);
  [npc, missions, photo].forEach((s) => G.addSystem(s));
  return {
    kit, G, api: photo.api(),
  };
}

function toCity(b) {
  const r = b.kit.mgr.swap('neon', { reason: 'test' });
  expect(r.ok).toBe(true);
  const w = b.G.world;
  for (let cx = -5; cx <= 5; cx++) for (let cz = -5; cz <= 5; cz++) w.ensureChunk(cx, cz);
  b.kit.place(1.5, 64, 4.5, 0);
  b.G.hud.city = { kredi: 0, district: '', mission: null, radio: '', light: null };
  b.kit.frame(1 / 60, 30);
  const ctx = b.kit.mgr.get('neon');
  ctx.terminals.found = 0xffff;
  b.kit.frame(1 / 60, 2);
}

function run(b, frames, onFrame) {
  let f = 0;
  while (b.G.cityPhoto.traveler.busy && f < frames) {
    if (onFrame) onFrame(f);
    b.kit.frame(1 / 60, 1);
    f++;
  }
  return f;
}

describe('hızlı seyahat: ilerleme sürerken zaman aşımı olmaz (QA4-004)', () => {
  it('parçalar 12 sn boyunca yavaş ama sürekli ilerler → seyahat TAMAMLANIR (başlangıca dönülmez, iade yok)', () => {
    const b = boot();
    toCity(b);
    const cm = b.G.chunkManager;
    cm.ready = false;
    cm.progress = 0.05;
    const r = b.api.fastTravel('t3');
    expect(r.ok).toBe(true);
    const f = run(b, 60 * 40, (i) => {
      const sec = i / 60;
      cm.progress = Math.min(0.99, 0.05 + sec * 0.08);
      if (sec >= 12) { cm.ready = true; cm.progress = 1; }
    });
    expect(b.G.cityPhoto.traveler.busy).toBe(false);
    expect(b.G.cityPhoto.traveler.state.aborted).toBe(0);
    expect(f / 60).toBeGreaterThan(11);
    expect(f / 60).toBeLessThan(20);
    const node = b.api.getFastTravel().nodes.find((n) => n.id === 't3');
    expect(Math.hypot(b.G.body.x - node.x, b.G.body.z - node.z)).toBeLessThan(40);
  });

  it('ilerleme tamamen durursa 6 sn sonra başlangıca döner (eski davranış); mutlak üst sınır 25 sn', () => {
    expect(FAST_TRAVEL.timeout).toBe(6);
    expect(FAST_TRAVEL.maxHold).toBe(25);
    const b = boot();
    toCity(b);
    const cm = b.G.chunkManager;
    cm.ready = false;
    cm.progress = 0.3;
    expect(b.api.fastTravel('t3').ok).toBe(true);
    let when = -1;
    run(b, 60 * 40, (i) => {
      if (when < 0 && b.G.cityPhoto.traveler.state.aborted > 0) when = i / 60;
      if (i === 60 * 9) { cm.ready = true; cm.progress = 1; }
    });
    expect(b.G.cityPhoto.traveler.state.aborted).toBe(1);
    expect(when).toBeGreaterThan(5);
    expect(when).toBeLessThan(9.5);
    // damla damla ilerleme sonsuza dek bekletmez: 25 sn'de pes eder
    const b2 = boot();
    toCity(b2);
    const cm2 = b2.G.chunkManager;
    cm2.ready = false;
    cm2.progress = 0.01;
    expect(b2.api.fastTravel('t3').ok).toBe(true);
    let when2 = -1;
    run(b2, 60 * 60, (i) => {
      cm2.progress = Math.min(0.9, 0.01 + (i / 60) * 0.01);
      if (when2 < 0 && b2.G.cityPhoto.traveler.state.aborted > 0) when2 = i / 60;
      if (i === 60 * 30) { cm2.ready = true; cm2.progress = 1; }
    });
    expect(b2.G.cityPhoto.traveler.state.aborted).toBe(1);
    expect(when2).toBeGreaterThan(23);
    expect(when2).toBeLessThan(27);
  });
});
