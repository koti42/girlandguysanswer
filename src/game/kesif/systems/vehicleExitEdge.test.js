/*
 * QA5-A-002 (Faz 5 kapanis, gozlem A, ikinci belirti): "İn" dokunusu hicbir sey yapmadi (pointerdown var, click yok, arac hala suruluyor).
 * Kok neden: kenar bayraklari (interactPressed) bir CIZIM KARESININ tum sabit adimlari boyunca kilitli kalir (game.js: clearEdges tum fixedPass'lerden sonra).
 * Karede ≥ 2 sabit adim varsa (kare > 33 ms: yuklu makine, dusuk fps telefon) 1. adimda `exit()` oyuncuyu araca bitisik noktaya indirir, 2. adimda ayni
 * kilitli kenar YURUME dalinda "en yakin araca bin" olarak okunur ve oyuncu hemen yeniden biner (ENTER_GUARD yalniz bin→in yonunu korur). Arayuz iki kez
 * sokulup takildigi icin tarayici click'i de kaybolur.
 * Test kiti `frame()` her adimi ayri kare sayip kenari araya siliyordu → hata gizliydi; burada kenar GERCEK dongudeki gibi tum adimlarda kilitli tutulur.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeDimG } from '../dimTestKit.js';
import { createSystem } from './vehicles.js';
import { setPose } from '../sim/city/vehicle/vehiclePhysics.js';

vi.setConfig({ testTimeout: 180000 });

function boot() {
  const kit = makeDimG({ render: true, systems: ['blocks', 'props', 'dimension'] });
  const G = kit.G;
  const sys = createSystem(G);
  G.addSystem(sys);
  return { kit, G, sys, api: sys.api() };
}

function toCity(b, px, pz) {
  expect(b.kit.mgr.swap('neon', { reason: 'test' }).ok).toBe(true);
  const w = b.G.world;
  for (let cx = Math.floor((px - 90) / 16); cx <= Math.floor((px + 90) / 16); cx++) for (let cz = Math.floor((pz - 90) / 16); cz <= Math.floor((pz + 90) / 16); cz++) w.ensureChunk(cx, cz);
  b.kit.place(px, 64, pz, 0);
  b.G.worldReady = true;
  b.kit.frame(1 / 60, 40);
}

/** Gercek dongu: kenar bayragi tum adimlarda kilitli, kare sonunda silinir. */
function realFrame(b, steps, edges) {
  Object.keys(edges || {}).forEach((k) => { b.G.inputState[k] = edges[k]; });
  b.kit.step(steps);
  Object.keys(edges || {}).forEach((k) => { b.G.inputState[k] = false; });
}

function boardAndPark(b) {
  const m = b.G.vehicles;
  const d = m.list().find((e) => e.role === 'display');
  expect(d).toBeTruthy();
  b.kit.place(d.v.x + 2.4, 64, d.v.z, Math.PI / 2);
  b.kit.frame(1 / 60, 3);
  realFrame(b, 1, { interactPressed: true });
  expect(b.G.player.vehicle).toBeTruthy();
  const e = b.G.vehicles.driven;
  for (let cx = -18; cx <= -12; cx++) for (let cz = -12; cz <= -3; cz++) b.G.world.ensureChunk(cx, cz);
  setPose(e.v, -236.5, 64, -60, 0);
  b.G.vehicles.syncProp(e);
  b.kit.frame(1 / 60, 30); // guard gecsin, arac dursun
  return e;
}

describe('araca in: kilitli kenar bayragi ayni karenin ikinci adiminda yeniden bindirmez', () => {
  [1, 2, 3, 6].forEach((steps) => {
    it(`karede ${steps} sabit adim: interactPressed ile in → oyuncu aracin disinda kalir`, () => {
      const b = boot();
      toCity(b, 0.5, 2.5);
      const e = boardAndPark(b);
      expect(Math.hypot(e.v.vx, e.v.vz)).toBeLessThan(1);
      realFrame(b, steps, { interactPressed: true });
      expect(b.G.player.vehicle).toBe(null);
      expect(b.G.vehicles.driven).toBe(null);
      expect(e.occupied).toBe(false);
      // sonraki kareler de disarida kalir (kenar silindi)
      b.kit.frame(1 / 60, 5);
      expect(b.G.player.vehicle).toBe(null);
    });
  });

  it('yurume → bin: karede 2 adim olsa da tek basista tek bin (hemen inme yok; guard)', () => {
    const b = boot();
    toCity(b, 0.5, 2.5);
    const e = boardAndPark(b);
    realFrame(b, 1, { interactPressed: true });
    expect(b.G.player.vehicle).toBe(null);
    b.kit.frame(1 / 60, 40);
    // araca bitisik tekrar bin: 3 adimlik karede
    realFrame(b, 3, { interactPressed: true });
    expect(b.G.player.vehicle).toBe(e.id);
  });
});
