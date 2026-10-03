// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canResume, createAudio } from './audio.js';
import { createInput } from './input.js';

/*
 * Ses ve girdi: WebAudio sahte bir bağlamla, girdi jsdom olaylarıyla sınanır.
 * Amaç iOS kurallarını sabitlemek (kilit parmak kalkınca açılır, 'interrupted'
 * durumundan dönülür) ve müziğin efektlerden ayrı kapatılabilmesi.
 */

function param(value = 0) {
    return {
        value,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
    };
}

function node(extra = {}) {
    return { connect: vi.fn(), ...extra };
}

class FakeAudioContext {
    constructor() {
        this.state = FakeAudioContext.initialState;
        this.currentTime = 1;
        this.sampleRate = 100;
        this.destination = node();
        this.resume = vi.fn(() => {
            this.state = 'running';
            return Promise.resolve();
        });
        this.suspend = vi.fn(() => Promise.resolve());
        this.close = vi.fn(() => Promise.resolve());
        this.oscillators = 0;
        this.gains = [];
        FakeAudioContext.last = this;
    }

    createGain() {
        const g = node({ gain: param(1) });
        this.gains.push(g);
        return g;
    }

    createDynamicsCompressor() {
        return node({ threshold: param(), ratio: param() });
    }

    createBuffer(_ch, length) {
        const data = new Float32Array(length);
        return { getChannelData: () => data };
    }

    createOscillator() {
        this.oscillators++;
        return node({ type: '', frequency: param(), start: vi.fn(), stop: vi.fn() });
    }

    createBiquadFilter() {
        return node({ type: '', frequency: param() });
    }

    createBufferSource() {
        return node({ buffer: null, start: vi.fn(), stop: vi.fn() });
    }
}
FakeAudioContext.initialState = 'suspended';

describe('ses: iOS kilidi ve kesinti', () => {
    beforeEach(() => {
        FakeAudioContext.initialState = 'suspended';
        FakeAudioContext.last = null;
        window.AudioContext = FakeAudioContext;
    });

    afterEach(() => {
        delete window.AudioContext;
    });

    it('canResume askıda ve kesintide true, çalışırken/kapalıyken false', () => {
        expect(canResume({ state: 'suspended' })).toBe(true);
        expect(canResume({ state: 'interrupted' })).toBe(true);
        expect(canResume({ state: 'running' })).toBe(false);
        expect(canResume({ state: 'closed' })).toBe(false);
        expect(canResume(null)).toBe(false);
    });

    it("unlock 'interrupted' bağlamı sürdürür", () => {
        FakeAudioContext.initialState = 'interrupted';
        const audio = createAudio();
        audio.unlock();
        expect(FakeAudioContext.last.resume).toHaveBeenCalledTimes(1);
        expect(FakeAudioContext.last.state).toBe('running');
        // Çalışırken tekrar unlock ucuz: resume çağrılmaz.
        audio.unlock();
        expect(FakeAudioContext.last.resume).toHaveBeenCalledTimes(1);
    });

    it("resume ve setMuted(false) 'interrupted' bağlamdan döner", () => {
        const audio = createAudio();
        audio.unlock();
        const ctx = FakeAudioContext.last;
        ctx.state = 'interrupted';
        audio.resume();
        expect(ctx.resume).toHaveBeenCalledTimes(2);
        ctx.state = 'interrupted';
        audio.setMuted(true);
        audio.setMuted(false);
        expect(ctx.resume).toHaveBeenCalledTimes(3);
    });

    it('sessizken unlock bağlam bile oluşturmaz', () => {
        const audio = createAudio({ muted: true });
        audio.unlock();
        expect(FakeAudioContext.last).toBeNull();
    });
});

describe('ses: müzik ayrı kapatılır', () => {
    beforeEach(() => {
        FakeAudioContext.initialState = 'running';
        FakeAudioContext.last = null;
        window.AudioContext = FakeAudioContext;
    });

    afterEach(() => {
        delete window.AudioContext;
    });

    // ensure() sırası: master, sfxGain, musicGain.
    const musicGainOf = (ctx) => ctx.gains[2];

    it('musicEnabled:false ile müzik planlanmaz, efektler çalar', () => {
        const audio = createAudio({ musicEnabled: false });
        audio.unlock();
        const ctx = FakeAudioContext.last;
        expect(musicGainOf(ctx).gain.value).toBe(0);
        audio.setMusic(true);
        audio.tick();
        expect(ctx.oscillators).toBe(0);
        audio.play('coin');
        expect(ctx.oscillators).toBeGreaterThan(0);
        expect(audio.isMusicEnabled()).toBe(false);
    });

    it('setMusicEnabled müziği açıp kapatır', () => {
        const audio = createAudio();
        audio.unlock();
        const ctx = FakeAudioContext.last;
        const music = musicGainOf(ctx);
        expect(music.gain.value).toBeGreaterThan(0);
        audio.setMusic(true);
        audio.tick();
        const afterOn = ctx.oscillators;
        expect(afterOn).toBeGreaterThan(0);

        audio.setMusicEnabled(false);
        expect(music.gain.value).toBe(0);
        ctx.currentTime += 1;
        audio.tick();
        expect(ctx.oscillators).toBe(afterOn);

        audio.setMusicEnabled(true);
        expect(music.gain.value).toBeGreaterThan(0);
        audio.tick();
        expect(ctx.oscillators).toBeGreaterThan(afterOn);
    });

    it('bağlam yokken setMusicEnabled hata vermez, sonra ayar korunur', () => {
        const audio = createAudio();
        audio.setMusicEnabled(false);
        audio.unlock();
        expect(musicGainOf(FakeAudioContext.last).gain.value).toBe(0);
    });
});

describe('girdi: ses kilidi jestleri', () => {
    let container;
    let canvas;
    let input;
    let onGesture;

    function pointer(type, target, props) {
        const e = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(e, { pointerId: 1, clientX: 0, clientY: 0, button: 0, ...props });
        target.dispatchEvent(e);
    }

    beforeEach(() => {
        container = document.createElement('div');
        canvas = document.createElement('canvas');
        container.appendChild(canvas);
        document.body.appendChild(container);
        onGesture = vi.fn();
        input = createInput({ container, canvas, onAction: vi.fn(), onGesture, isActive: () => true });
    });

    afterEach(() => {
        input.dispose();
        container.remove();
    });

    it('dokunmatik pointerup kilidi açar, fare pointerup ve pointercancel açmaz', () => {
        pointer('pointerup', canvas, { pointerType: 'touch' });
        expect(onGesture).toHaveBeenCalledTimes(1);
        pointer('pointerup', canvas, { pointerType: 'pen' });
        expect(onGesture).toHaveBeenCalledTimes(2);
        pointer('pointerup', canvas, { pointerType: 'mouse' });
        pointer('pointercancel', canvas, { pointerType: 'touch' });
        expect(onGesture).toHaveBeenCalledTimes(2);
    });

    it('container içindeki touchend kilidi açar; dispose sonrası dinlenmez', () => {
        const hud = document.createElement('div');
        container.appendChild(hud);
        hud.dispatchEvent(new Event('touchend', { bubbles: true }));
        expect(onGesture).toHaveBeenCalledTimes(1);
        input.dispose();
        canvas.dispatchEvent(new Event('touchend', { bubbles: true }));
        pointer('pointerup', canvas, { pointerType: 'touch' });
        expect(onGesture).toHaveBeenCalledTimes(1);
        // afterEach'teki ikinci dispose zararsız olmalı.
    });
});
