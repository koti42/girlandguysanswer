// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createTowerGame } from './game.js';

function setup({ active = true } = {}) {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    const button = document.createElement('button');
    container.appendChild(canvas);
    container.appendChild(button);
    document.body.appendChild(container);
    const handlers = {
        onTap: vi.fn(),
        onChoice: vi.fn(),
        onPauseKey: vi.fn(),
        onGesture: vi.fn(),
        isActive: vi.fn(() => active),
    };
    const input = createInput({ container, canvas, ...handlers });
    return { container, canvas, button, input, ...handlers };
}

const pointer = (target, type, props = {}) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { pointerType: 'touch', button: 0, isPrimary: true, ...props });
    target.dispatchEvent(e);
    return e;
};

const key = (target, props) => {
    const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...props });
    target.dispatchEvent(e);
    return e;
};

describe('kule girdisi', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('sahneye dokunuş katı bırakır, düğmeye dokunuş bırakmaz', () => {
        const s = setup();
        pointer(s.canvas, 'pointerdown');
        expect(s.onTap).toHaveBeenCalledTimes(1);
        expect(s.onGesture).toHaveBeenCalled();
        pointer(s.button, 'pointerdown');
        expect(s.onTap).toHaveBeenCalledTimes(1);
        // Farenin sağ tuşu ve ikincil parmak sayılmaz
        pointer(s.canvas, 'pointerdown', { pointerType: 'mouse', button: 2 });
        pointer(s.canvas, 'pointerdown', { isPrimary: false });
        expect(s.onTap).toHaveBeenCalledTimes(1);
        expect(s.container.style.touchAction).toBe('none');
        s.input.dispose();
    });

    it('Boşluk/Enter bırakır (basılı tutma tekrar etmez), oklar şık seçer', () => {
        const s = setup();
        const e = key(document.body, { code: 'Space', key: ' ' });
        expect(s.onTap).toHaveBeenCalledTimes(1);
        expect(e.defaultPrevented).toBe(true);
        key(document.body, { code: 'Space', key: ' ', repeat: true });
        expect(s.onTap).toHaveBeenCalledTimes(1);
        key(document.body, { code: 'Enter', key: 'Enter' });
        expect(s.onTap).toHaveBeenCalledTimes(2);
        key(document.body, { code: 'ArrowRight', key: 'ArrowRight' });
        expect(s.onChoice).toHaveBeenCalledWith(1);
        key(document.body, { code: 'Digit1', key: '1' });
        expect(s.onChoice).toHaveBeenLastCalledWith(0);
        s.input.dispose();
    });

    it('odaktaki düğmede Enter düğmenin kendisine ait (kat düşmez)', () => {
        const s = setup();
        key(s.button, { code: 'Enter', key: 'Enter' });
        expect(s.onTap).not.toHaveBeenCalled();
        s.input.dispose();
    });

    it('Esc/P yalnızca oyun etkinken duraklatır', () => {
        const s = setup();
        key(document.body, { code: 'Escape', key: 'Escape' });
        expect(s.onPauseKey).toHaveBeenCalledTimes(1);
        s.input.dispose();
        const t = setup({ active: false });
        key(document.body, { code: 'KeyP', key: 'p' });
        expect(t.onPauseKey).not.toHaveBeenCalled();
        t.input.dispose();
    });

    it('dispose dinleyicileri kaldırır ve touch-action\'ı geri yükler', () => {
        const s = setup();
        s.input.dispose();
        pointer(s.canvas, 'pointerdown');
        key(document.body, { code: 'Space', key: ' ' });
        expect(s.onTap).not.toHaveBeenCalled();
        expect(s.container.style.touchAction).toBe('');
    });
});

describe('kule sesi', () => {
    let original;
    beforeEach(() => {
        original = window.AudioContext;
    });
    afterEach(() => {
        window.AudioContext = original;
    });

    it('AudioContext yoksa sessizce çalışır', () => {
        window.AudioContext = undefined;
        const a = createAudio({ muted: false });
        expect(() => {
            a.unlock();
            a.play('perfect', 3);
            a.setMusic(true);
            a.tick();
            a.setMuted(true);
            a.setMusicEnabled(false);
            a.suspend();
            a.resume();
            a.dispose();
        }).not.toThrow();
    });

    it('sessizde bağlam bile açılmaz; müzik anahtarı izlenir', () => {
        const ctor = vi.fn();
        window.AudioContext = ctor;
        const a = createAudio({ muted: true, musicEnabled: false });
        a.unlock();
        a.play('place');
        expect(ctor).not.toHaveBeenCalled();
        expect(a.isMusicEnabled()).toBe(false);
        a.setMusicEnabled(true);
        expect(a.isMusicEnabled()).toBe(true);
        a.dispose();
    });
});

describe('createTowerGame giriş kontrolü', () => {
    it('container yoksa / sorular bozuksa WebGL kurmadan hata verir', async () => {
        await expect(createTowerGame({})).rejects.toThrow(TypeError);
        const container = document.createElement('div');
        await expect(createTowerGame({ container, questions: 'x' })).rejects.toThrow(TypeError);
        await expect(createTowerGame({ container, questions: [{ index: 1 }] })).rejects.toThrow(/0..n-1/);
    });
});
