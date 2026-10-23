// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createKesifInput } from './input.js';

function rig() {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  document.body.appendChild(container);
  container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
  const input = createKesifInput({ container, canvas, controls: 'desktop', now: () => 1000 });
  return { input };
}
const key = (type, code, props = {}) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true, cancelable: true, ...props }));

afterEach(() => { document.body.innerHTML = ''; });

describe('panel/menü kapanınca hâlâ basılı tuş', () => {
  it('W basılıyken panel açılıp kapanırsa otomatik tekrar tuşu yeniden basılı yapar (kenar olayı üretmez)', () => {
    const { input } = rig();
    key('keydown', 'KeyW');
    expect(input.getState().moveZ).toBe(1);
    input.setGameplayEnabled(false); // envanter açıldı: tuşlar bırakılır
    expect(input.getState().moveZ).toBe(0);
    input.setGameplayEnabled(true); // kapandı; W fiziksel olarak hâlâ basılı
    expect(input.getState().moveZ).toBe(0); // henüz tekrar olayı yok
    key('keydown', 'KeyW', { repeat: true });
    expect(input.getState().moveZ).toBe(1);
    key('keyup', 'KeyW');
    expect(input.getState().moveZ).toBe(0);
  });

  it('Space tekrarı zıplama KENARI üretmez, yalnız basılı tutar', () => {
    const { input } = rig();
    key('keydown', 'Space');
    input.getState();
    input.setGameplayEnabled(false);
    input.setGameplayEnabled(true);
    key('keydown', 'Space', { repeat: true });
    const s = input.getState();
    expect(s.jump).toBe(true);
    expect(s.jumpPressed).toBe(false);
  });

  it('bırakılmış tuşun gecikmiş tekrar olayı panel açıkken yok sayılır', () => {
    const { input } = rig();
    input.setGameplayEnabled(false);
    key('keydown', 'KeyW', { repeat: true });
    input.setGameplayEnabled(true);
    expect(input.getState().moveZ).toBe(0);
  });
});

describe('Esc çift işleme', () => {
  it('bir panel Esc\'i zaten işlediyse (defaultPrevented) motor duraklat olayı üretmez', () => {
    const { input } = rig();
    const e = new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true, cancelable: true });
    e.preventDefault();
    window.dispatchEvent(e);
    expect(input.consumeEvents().filter((x) => x.type === 'pause')).toHaveLength(0);
    key('keydown', 'Escape');
    expect(input.consumeEvents().filter((x) => x.type === 'pause')).toHaveLength(1);
  });

  it('imleç kilidi kaybı: duraklat olayı source=lock taşır (yalnız duraklatır, geri açmaz)', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400, right: 800, bottom: 400 });
    let locked = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
    const input = createKesifInput({ container, canvas, controls: 'desktop', now: () => 1000 });
    locked = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    locked = null;
    document.dispatchEvent(new Event('pointerlockchange'));
    const ev = input.consumeEvents().filter((x) => x.type === 'pause');
    expect(ev).toHaveLength(1);
    expect(ev[0].source).toBe('lock');
    delete document.pointerLockElement;
  });
});
