/*
 * PROTOCOL: ZERO ses motoru — harici dosya yok, her şey osilatör/gürültü ile gerçek zamanlı sentez.
 *
 *   const sfx = new SoundEngine({ muted });
 *   sfx.unlock();                 // ilk kullanıcı jestinde (kendisi de pointerdown/keydown dinler)
 *   sfx.play('click' | 'ping' | 'upgrade' | 'purge' | 'isolate' | 'data' | 'tick' | 'hit' | 'miss' |
 *            'dilemma' | 'success' | 'fail' | 'victory' | 'defeat' | 'reseed' | 'tech' | 'coin');
 *   sfx.startAlarm() / sfx.stopAlarm();      // kırmızı alarm sireni (döngü)
 *   sfx.startAmbient() / sfx.stopAmbient();  // komuta merkezi uğultusu
 *   sfx.setMuted(bool); sfx.dispose();
 *
 * Zincir: ses → master gain → compressor → çıkış. Sessizken bağlam hiç kurulmaz.
 */

const GESTURES = ['pointerdown', 'keydown', 'touchend', 'click'];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class SoundEngine {
    constructor({ muted = false, volume = 0.7 } = {}) {
        this.ctx = null;
        this.master = null;
        this.alarm = null;
        this.ambient = null;
        this.noiseBuffer = null;
        this._muted = Boolean(muted);
        this._volume = clamp(volume, 0, 1);
        this._disposed = false;
        this._onGesture = () => this.unlock();
        if (typeof window !== 'undefined') {
            for (const ev of GESTURES) window.addEventListener(ev, this._onGesture, { passive: true });
            this._onVis = () => {
                if (!this.ctx) return;
                if (document.hidden) this.ctx.suspend?.().catch(() => {});
                else if (!this._muted) this.ctx.resume?.().catch(() => {});
            };
            document.addEventListener('visibilitychange', this._onVis);
        }
    }

    get muted() {
        return this._muted;
    }

    get supported() {
        return typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);
    }

    /** Bağlamı kurar / sürdürür. Kullanıcı jesti içinden çağrılmalı. */
    unlock() {
        if (this._disposed || this._muted || !this.supported) return false;
        try {
            if (!this.ctx) {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                this.ctx = new Ctx();
                this.master = this.ctx.createGain();
                this.master.gain.value = this._volume;
                const comp = this.ctx.createDynamicsCompressor();
                comp.threshold.value = -18;
                comp.knee.value = 20;
                comp.ratio.value = 6;
                comp.attack.value = 0.004;
                comp.release.value = 0.2;
                this.master.connect(comp);
                comp.connect(this.ctx.destination);
            }
            if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') this.ctx.resume().catch(() => {});
            return true;
        } catch {
            this.ctx = null;
            return false;
        }
    }

    setMuted(m) {
        this._muted = Boolean(m);
        if (this._muted) {
            this.stopAlarm();
            this.stopAmbient();
            this.ctx?.suspend?.().catch(() => {});
        } else {
            this.unlock();
        }
    }

    setVolume(v) {
        this._volume = clamp(v, 0, 1);
        if (this.master) this.master.gain.value = this._volume;
    }

    dispose() {
        this._disposed = true;
        this.stopAlarm();
        this.stopAmbient();
        if (typeof window !== 'undefined') {
            for (const ev of GESTURES) window.removeEventListener(ev, this._onGesture);
            if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
        }
        try {
            this.ctx?.close?.();
        } catch {
            // zaten kapalı
        }
        this.ctx = null;
        this.master = null;
    }

    /* ---------------------------- iç yardımcılar ---------------------------- */

    _ready() {
        if (this._muted || this._disposed) return false;
        if (!this.ctx) this.unlock();
        return Boolean(this.ctx && this.master && this.ctx.state === 'running');
    }

    _noise() {
        if (!this.noiseBuffer) {
            const len = this.ctx.sampleRate * 1;
            const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buf;
        }
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        return src;
    }

    /** Tek osilatör + zarf. freqTo verilirse kayar. */
    _tone({ type = 'sine', freq = 440, freqTo = null, dur = 0.2, gain = 0.2, at = 0, attack = 0.005, filter = null, detune = 0 }) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime + at;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        if (detune) osc.detune.value = detune;
        if (freqTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqTo), t0 + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        let last = osc;
        if (filter) {
            const f = ctx.createBiquadFilter();
            f.type = filter.type || 'lowpass';
            f.frequency.setValueAtTime(filter.freq || 1200, t0);
            if (filter.freqTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.freqTo), t0 + dur);
            f.Q.value = filter.q ?? 1;
            osc.connect(f);
            last = f;
        }
        last.connect(g);
        g.connect(this.master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.05);
        return osc;
    }

    _burst({ dur = 0.3, gain = 0.2, at = 0, filter = { type: 'lowpass', freq: 2000, freqTo: 200 } }) {
        const ctx = this.ctx;
        const t0 = ctx.currentTime + at;
        const src = this._noise();
        const f = ctx.createBiquadFilter();
        f.type = filter.type;
        f.frequency.setValueAtTime(filter.freq, t0);
        if (filter.freqTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, filter.freqTo), t0 + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f);
        f.connect(g);
        g.connect(this.master);
        src.start(t0);
        src.stop(t0 + dur + 0.05);
    }

    /* -------------------------------- sesler -------------------------------- */

    play(name) {
        if (!this._ready()) return;
        try {
            const fn = RECIPES[name];
            if (fn) fn(this);
        } catch {
            // bir tarayıcı bir düğümü desteklemiyorsa oyun sessizce sürsün
        }
    }

    startAlarm() {
        if (this.alarm || !this._ready()) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 700;
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.9;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 180;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.2);
        osc.connect(filter);
        filter.connect(g);
        g.connect(this.master);
        osc.start();
        lfo.start();
        this.alarm = { osc, lfo, g };
    }

    stopAlarm() {
        const a = this.alarm;
        if (!a || !this.ctx) {
            this.alarm = null;
            return;
        }
        const t = this.ctx.currentTime;
        try {
            a.g.gain.cancelScheduledValues(t);
            a.g.gain.setValueAtTime(a.g.gain.value, t);
            a.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
            a.osc.stop(t + 0.3);
            a.lfo.stop(t + 0.3);
        } catch {
            // zaten durmuş
        }
        this.alarm = null;
    }

    startAmbient() {
        if (this.ambient || !this._ready()) return;
        const ctx = this.ctx;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 2);
        g.connect(this.master);
        const o1 = ctx.createOscillator();
        o1.type = 'triangle';
        o1.frequency.value = 55;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = 55.6;
        const o3 = ctx.createOscillator();
        o3.type = 'sine';
        o3.frequency.value = 110.3;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lfoG = ctx.createGain();
        lfoG.gain.value = 0.02;
        lfo.connect(lfoG);
        lfoG.connect(g.gain);
        const noise = this._noise();
        const nf = ctx.createBiquadFilter();
        nf.type = 'bandpass';
        nf.frequency.value = 400;
        nf.Q.value = 0.6;
        const ng = ctx.createGain();
        ng.gain.value = 0.12;
        noise.connect(nf);
        nf.connect(ng);
        ng.connect(g);
        for (const o of [o1, o2, o3]) o.connect(g);
        o1.start();
        o2.start();
        o3.start();
        lfo.start();
        noise.start();
        this.ambient = { g, nodes: [o1, o2, o3, lfo, noise] };
    }

    stopAmbient() {
        const a = this.ambient;
        if (!a || !this.ctx) {
            this.ambient = null;
            return;
        }
        const t = this.ctx.currentTime;
        try {
            a.g.gain.cancelScheduledValues(t);
            a.g.gain.setValueAtTime(a.g.gain.value, t);
            a.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
            for (const n of a.nodes) n.stop(t + 0.9);
        } catch {
            // zaten durmuş
        }
        this.ambient = null;
    }
}

const RECIPES = {
    click: (s) => s._tone({ type: 'square', freq: 880, freqTo: 440, dur: 0.06, gain: 0.08 }),
    ping: (s) => {
        s._tone({ type: 'sine', freq: 1240, freqTo: 1180, dur: 0.7, gain: 0.14 });
        s._tone({ type: 'sine', freq: 1240, freqTo: 1150, dur: 0.5, gain: 0.05, at: 0.18 });
    },
    data: (s) => {
        for (let i = 0; i < 3; i++) s._tone({ type: 'square', freq: 1500 + Math.random() * 1200, dur: 0.035, gain: 0.04, at: i * 0.05 });
    },
    upgrade: (s) => {
        [523, 659, 784].forEach((f, i) => s._tone({ type: 'triangle', freq: f, dur: 0.14, gain: 0.12, at: i * 0.08 }));
    },
    tech: (s) => {
        [392, 523, 659, 784, 1047].forEach((f, i) => s._tone({ type: 'triangle', freq: f, dur: 0.16, gain: 0.11, at: i * 0.07 }));
        s._tone({ type: 'sine', freq: 1568, dur: 0.5, gain: 0.05, at: 0.35 });
    },
    coin: (s) => {
        s._tone({ type: 'square', freq: 988, dur: 0.08, gain: 0.07 });
        s._tone({ type: 'square', freq: 1319, dur: 0.18, gain: 0.07, at: 0.08 });
    },
    purge: (s) => {
        s._burst({ dur: 0.38, gain: 0.22, filter: { type: 'lowpass', freq: 2600, freqTo: 180 } });
        s._tone({ type: 'sawtooth', freq: 160, freqTo: 60, dur: 0.3, gain: 0.08 });
    },
    isolate: (s) => {
        s._tone({ type: 'sawtooth', freq: 420, freqTo: 110, dur: 0.32, gain: 0.1, filter: { type: 'lowpass', freq: 1400, freqTo: 300 } });
        s._tone({ type: 'square', freq: 90, dur: 0.12, gain: 0.08, at: 0.3 });
    },
    reseed: (s) => {
        s._burst({ dur: 0.18, gain: 0.12, filter: { type: 'highpass', freq: 800, freqTo: 3000 } });
        s._tone({ type: 'square', freq: 110, freqTo: 80, dur: 0.25, gain: 0.08, at: 0.05 });
    },
    tick: (s) => s._tone({ type: 'triangle', freq: 1000, dur: 0.045, gain: 0.07 }),
    hit: (s) => s._tone({ type: 'square', freq: 660, freqTo: 990, dur: 0.07, gain: 0.08 }),
    miss: (s) => s._tone({ type: 'sawtooth', freq: 220, freqTo: 140, dur: 0.18, gain: 0.1, filter: { type: 'lowpass', freq: 900 } }),
    dilemma: (s) => {
        s._tone({ type: 'sine', freq: 440, dur: 0.4, gain: 0.1 });
        s._tone({ type: 'sine', freq: 554, dur: 0.4, gain: 0.08, at: 0.02 });
        s._tone({ type: 'sine', freq: 659, dur: 0.5, gain: 0.06, at: 0.25 });
    },
    success: (s) => {
        [523, 659, 784, 1047].forEach((f, i) => s._tone({ type: 'triangle', freq: f, dur: 0.2, gain: 0.12, at: i * 0.09 }));
    },
    fail: (s) => {
        [440, 415, 370, 311].forEach((f, i) => s._tone({ type: 'sawtooth', freq: f, dur: 0.3, gain: 0.09, at: i * 0.18, filter: { type: 'lowpass', freq: 1200 } }));
    },
    victory: (s) => {
        [523, 659, 784, 1047, 1319].forEach((f, i) => s._tone({ type: 'triangle', freq: f, dur: 0.22, gain: 0.12, at: i * 0.11 }));
        [523, 659, 784].forEach((f) => s._tone({ type: 'sine', freq: f, dur: 1.6, gain: 0.05, at: 0.6 }));
    },
    defeat: (s) => {
        [330, 311, 262, 196].forEach((f, i) => s._tone({ type: 'sawtooth', freq: f, dur: 0.6, gain: 0.08, at: i * 0.35, filter: { type: 'lowpass', freq: 700 } }));
        s._burst({ dur: 1.4, gain: 0.08, at: 0.2, filter: { type: 'lowpass', freq: 500, freqTo: 80 } });
    },
};

export const SOUND_NAMES = Object.freeze(Object.keys(RECIPES));
