import { describe, expect, it } from 'vitest';
import { applyLook, bodyIsFinite, createPlayerCore } from './gamePlayer.js';

function stubG(over) {
  const G = {
    body: { x: 0, y: 70, z: 0, vx: 0, vy: 0, vz: 0, eyeH: 1.6 },
    player: { yaw: 0, pitch: 0, dead: false },
    inputState: {
      moveX: 0, moveZ: 0, jump: false, crouch: false, sprint: false, breakHeld: false, placeHeld: false, lookDX: 0, lookDY: 0,
      jumpPressed: false, attackPressed: false, placePressed: false, interactPressed: false, touch: false, locked: false,
    },
    time: { paused: false },
    worldReady: true,
    inputOverride: null,
    input: null,
    look: { x: 0, y: 0, z: -1 },
    mode: 'macera',
    survival: {},
    ...over,
  };
  return G;
}

describe('applyLook / bodyIsFinite', () => {
  it('NaN ve Infinity farkları yaw/pitch\'i zehirlemez', () => {
    const p = { yaw: 1, pitch: 0.2 };
    applyLook(p, NaN, Infinity);
    expect(p.yaw).toBe(1);
    expect(p.pitch).toBe(0.2);
    applyLook(p, -Infinity, NaN);
    expect(Number.isFinite(p.yaw)).toBe(true);
    expect(p.yaw).toBe(1);
  });
  it('zaten bozuk yaw/pitch bir sonraki bakışta onarılır', () => {
    const p = { yaw: NaN, pitch: NaN };
    applyLook(p, 0.1, 0.1);
    expect(Number.isFinite(p.yaw)).toBe(true);
    expect(Number.isFinite(p.pitch)).toBe(true);
  });
  it('bodyIsFinite', () => {
    expect(bodyIsFinite({ x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0 })).toBe(true);
    expect(bodyIsFinite({ x: NaN, y: 2, z: 3, vx: 0, vy: 0, vz: 0 })).toBe(false);
    expect(bodyIsFinite({ x: 1, y: 2, z: 3, vx: 0, vy: Infinity, vz: 0 })).toBe(false);
  });
});

describe('pollInput: duraklatılmışken kilitli kenarlar silinir', () => {
  it('menü açılırken kilitlenen saldırı/yerleştir/zıpla kenarı devamda sahte eylem üretmez', () => {
    const G = stubG({ inputOverride: { attackPressed: true, placePressed: true, jumpPressed: true, interactPressed: true } });
    const core = createPlayerCore(G, { snap() {}, onLand() {}, onHurt() {} }, { footstep() {} });
    core.pollInput(1 / 60); // oyun sürerken: kenarlar kilitlenir
    expect(G.inputState.attackPressed).toBe(true);
    expect(G.inputState.placePressed).toBe(true);
    G.time.paused = true; // aynı karede Esc → duraklat; adım atılmadığı için clearEdges çağrılmaz
    core.pollInput(1 / 60);
    expect(G.inputState.attackPressed).toBe(false);
    expect(G.inputState.placePressed).toBe(false);
    expect(G.inputState.jumpPressed).toBe(false);
    expect(G.inputState.interactPressed).toBe(false);
    G.time.paused = false;
    G.inputOverride = { moveZ: 0 };
    core.pollInput(1 / 60);
    expect(G.inputState.attackPressed).toBe(false);
  });
});
