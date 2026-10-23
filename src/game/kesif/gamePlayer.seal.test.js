/*
 * KEŞİF — QA5: Mühür kuralı oyuncu çekirdeğinde. Bariyer halkası 0..yMax katıdır ama gövde ayağı tavanda (y = yTop) bariyerin ÜSTÜNDEN
 * geçebiliyordu (jetpack/planör/kule): kilitli bölgeye uçarak geçiş. Artık kilitli bölge (ve dünya kenarı) her yükseklikte kapalıdır.
 */
import { describe, expect, it } from 'vitest';
import { createPlayerCore, sealBlocked } from './gamePlayer.js';
import { createSurvival } from './sim/survival.js';
import { createPlayerBody } from './sim/physics.js';
import { WORLD_RADIUS, ZONES } from './sim/constants.js';

const R0 = ZONES[0].rOut;

function fakeWorld(unlocked) {
  return {
    legacy: false,
    frame: null,
    yMin: -400,
    yMax: 362,
    yTop: 363,
    isZoneUnlocked: (i) => i <= 0 || !!unlocked[i],
    getBlock: (x, y) => (y < 0 ? 1 : 0), // geniş düz zemin; bariyer tavan boşluğunu test için YOK (yalnız yatay kapı)
    ensureSectionsNear() {},
    hasChunk: () => true,
    canGenerate: () => true,
  };
}

describe('sealBlocked (saf)', () => {
  it('kilitli bölgeye ve dünya kenarının ötesine kapalı; açık bölgeye açık; legacy/harita modunda etkisiz', () => {
    const w = fakeWorld({});
    expect(sealBlocked(w, R0 - 1, 0)).toBe(false);
    expect(sealBlocked(w, R0 + 0.5, 0)).toBe(true);
    expect(sealBlocked(w, 0, -(R0 + 30))).toBe(true);
    const open = fakeWorld({ 1: true });
    expect(sealBlocked(open, R0 + 30, 0)).toBe(false);
    expect(sealBlocked(open, ZONES[1].rOut + 5, 0)).toBe(true); // bölge 2 hâlâ kilitli
    expect(sealBlocked(fakeWorld({ 1: true, 2: true, 3: true, 4: true }), WORLD_RADIUS + 10, 0)).toBe(true); // dünya kenarı
    expect(sealBlocked(Object.assign(fakeWorld({}), { legacy: true }), R0 + 50, 0)).toBe(false);
    expect(sealBlocked(Object.assign(fakeWorld({}), { frame: {} }), R0 + 50, 0)).toBe(false);
    expect(sealBlocked(null, 1e6, 0)).toBe(false);
  });

  it('bölge 2 açık ama 1 kilitliyse (sıra atlama) 2\'ye geçilemez', () => {
    const w = fakeWorld({ 2: true });
    expect(sealBlocked(w, R0 + 5, 0)).toBe(true);
    expect(sealBlocked(w, ZONES[1].rOut + 5, 0)).toBe(true);
  });
});

describe('oyuncu çekirdeği: tavandan jetpack ile bariyer üstü geçiş', () => {
  function rig(unlocked) {
    const emitted = [];
    const G = {
      mode: 'macera',
      world: fakeWorld(unlocked),
      body: createPlayerBody(R0 - 8, 363, 0.5),
      player: { yaw: -Math.PI / 2, pitch: 0, dead: false },
      inputState: {
        moveX: 0, moveZ: 1, jump: true, crouch: false, sprint: true, breakHeld: false, placeHeld: false, lookDX: 0, lookDY: 0,
        jumpPressed: false, attackPressed: false, placePressed: false, interactPressed: false, touch: false, locked: false,
      },
      time: { paused: false, tick: 0, seconds: 0 },
      worldReady: true,
      inputOverride: null,
      input: null,
      look: { x: 0, y: 0, z: -1 },
      eyeSim: { x: 0, y: 0, z: 0 },
      spawn: { x: 0, y: 70, z: 0 },
      survival: createSurvival({}),
      abilities: { doubleJump: false, grapple: false, glide: false },
      hud: {},
      mods: null,
      emit: (e) => emitted.push(e),
      sound() {},
      speak() {},
      haptic() {},
    };
    G.body.eyeH = 1.62;
    const core = createPlayerCore(G, { snap() {}, onLand() {}, onHurt() {} }, { footstep() {} });
    return { G, core, emitted };
  }

  it('kilitliyken x ekseninde R0\'ı geçemez, ipucu olayı gelir; açılınca geçer', () => {
    const { G, core, emitted } = rig({});
    G.body.vy = 0;
    let maxR = 0;
    for (let i = 0; i < 60 * 8; i++) {
      G.time.tick++;
      core.system.fixedUpdate(G, 1 / 60);
      maxR = Math.max(maxR, Math.hypot(G.body.x, G.body.z));
    }
    expect(maxR).toBeLessThan(R0);
    expect(emitted.some((e) => e.type === 'actionDenied' && e.reason === 'seal')).toBe(true);
    const open = rig({ 1: true });
    for (let i = 0; i < 60 * 8; i++) {
      open.G.time.tick++;
      open.core.system.fixedUpdate(open.G, 1 / 60);
    }
    expect(open.G.body.x).toBeGreaterThan(R0 + 2);
  });
});
