/*
 * Kule sesleri: WebAudio ile sentezlenir, hiç ses dosyası yok.
 *
 * Mükemmel yerleşimde çalan nota kombo arttıkça majör pentatonikte bir
 * basamak yükselir (5'te bir oktav), kombo bozulunca baştan başlar: seri
 * kulakla da hissedilsin. Arka planda yumuşak, rüya gibi bir döngü (pad +
 * arpej + hafif ritim); ayrıca kapatılabilir (musicEnabled).
 *
 * AudioContext ilk kullanıcı etkileşiminde açılır (tarayıcı kuralı);
 * sessizde düğüm bile oluşturulmaz. Duraklatmada askıya alınır, destroy'da
 * kapatılır.
 */

const MASTER = 0.55;
const MUSIC = 0.12;
const BPM = 92;
const STEP_S = 60 / BPM / 4; // 16'lık
// Fmaj7 - Am7 - Dm7 - C(add9): kök + akor notaları (Hz)
const CHORDS = [
    [87.31, 349.23, 440.0, 523.25, 659.25],
    [110.0, 329.63, 392.0, 440.0, 523.25],
    [73.42, 293.66, 349.23, 440.0, 523.25],
    [65.41, 293.66, 329.63, 392.0, 523.25],
];
// Majör pentatonik (yarım ton)
const PENTA = [0, 2, 4, 7, 9];
const NOTE_BASE = 523.25; // C5

export const canResume = (c) => Boolean(c) && (c.state === 'suspended' || c.state === 'interrupted');

/** Kombo n (1..) için mükemmel notasının frekansı (saf; test edilir). */
export function comboFrequency(combo) {
    const n = Math.max(0, Math.min(15, Math.floor(combo) - 1));
    const oct = Math.floor(n / PENTA.length);
    const semi = PENTA[n % PENTA.length] + oct * 12;
    return NOTE_BASE * Math.pow(2, semi / 12);
}

export function createAudio({ muted = false, musicEnabled: musicIn = true } = {}) {
    let ctx = null;
    let master = null;
    let musicGain = null;
    let sfxGain = null;
    let noise = null;
    let isMuted = Boolean(muted);
    let musicEnabled = Boolean(musicIn);
    let closed = false;
    let musicOn = false;
    let nextStepTime = 0;
    let step = 0;

    function ensure() {
        if (closed) return null;
        if (ctx) return ctx;
        const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
        if (!AC) return null;
        try {
            ctx = new AC();
        } catch {
            ctx = null;
            return null;
        }
        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : MASTER;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        master.connect(comp);
        comp.connect(ctx.destination);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 1;
        sfxGain.connect(master);
        musicGain = ctx.createGain();
        musicGain.gain.value = musicEnabled ? MUSIC : 0;
        musicGain.connect(master);
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        let seed = 98765;
        for (let i = 0; i < data.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            data[i] = (seed / 0x7fffffff) * 2 - 1;
        }
        return ctx;
    }

    function ready() {
        return ctx && !isMuted && !closed && ctx.state === 'running';
    }

    function tone(type, f0, f1, t0, dur, vol, out = sfxGain, attack = 0.008) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g);
        g.connect(out);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
    }

    function noiseHit(t0, dur, vol, filterType, f0, f1, out = sfxGain) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.setValueAtTime(f0, t0);
        if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f);
        f.connect(g);
        g.connect(out);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + dur + 0.02);
    }

    const SOUNDS = {
        place(t) {
            // Beton bloğun oturması: kısa, tok vuruş
            tone('sine', 190, 70, t, 0.14, 0.32);
            noiseHit(t, 0.08, 0.16, 'lowpass', 1400, 300);
        },
        cut(t) {
            // Kesilip kopan parça
            noiseHit(t, 0.18, 0.2, 'bandpass', 2600, 700);
            tone('triangle', 420, 160, t, 0.16, 0.06);
        },
        perfect(t, combo = 1) {
            const f = comboFrequency(combo);
            tone('triangle', f, f, t, 0.5, 0.12, sfxGain, 0.004);
            tone('sine', f * 2, f * 2, t, 0.35, 0.06, sfxGain, 0.004);
            tone('sine', 150, 70, t, 0.1, 0.18);
            if (combo >= 2) tone('sine', f * 3, f * 3, t + 0.06, 0.25, 0.025, sfxGain, 0.004);
        },
        grow(t) {
            [1046.5, 1318.5, 1568.0].forEach((f, i) => tone('sine', f, f, t + 0.05 + i * 0.045, 0.22, 0.035, sfxGain, 0.004));
        },
        miss(t) {
            tone('sawtooth', 320, 70, t, 0.55, 0.09);
            noiseHit(t + 0.05, 0.6, 0.3, 'lowpass', 1800, 120);
            tone('sine', 110, 40, t + 0.08, 0.5, 0.3);
        },
        question(t) {
            tone('sine', 784, 784, t, 0.18, 0.12);
            tone('sine', 1174.7, 1174.7, t + 0.12, 0.3, 0.1);
        },
        select(t) {
            tone('sine', 880, 880, t, 0.08, 0.08);
        },
        correct(t) {
            [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone('square', f, f, t + i * 0.07, 0.16, 0.06));
            tone('sine', 1318.5, 1318.5, t + 0.28, 0.45, 0.08);
        },
        wrong(t) {
            tone('sawtooth', 330, 196, t, 0.32, 0.08);
            tone('sawtooth', 311, 185, t + 0.12, 0.36, 0.07);
        },
        count(t) {
            tone('sine', 660, 660, t, 0.14, 0.14);
        },
        go(t) {
            tone('sine', 990, 990, t, 0.3, 0.16);
            tone('triangle', 1320, 1320, t, 0.3, 0.06);
        },
    };

    function scheduleMusic() {
        const ahead = ctx.currentTime + 0.15;
        if (nextStepTime < ctx.currentTime - 0.05) nextStepTime = ctx.currentTime + 0.02;
        while (nextStepTime < ahead) {
            const t = nextStepTime;
            const s = step % 16;
            const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
            // Pad: ölçü başında yumuşak akor (yavaş giriş)
            if (s === 0) {
                for (let i = 1; i < 4; i++) tone('sine', chord[i] / 2, chord[i] / 2, t, STEP_S * 15, 0.08, musicGain, 0.4);
                tone('triangle', chord[0], chord[0], t, STEP_S * 7, 0.22, musicGain, 0.02);
            }
            if (s === 8) tone('triangle', chord[0], chord[0], t, STEP_S * 7, 0.18, musicGain, 0.02);
            if (s === 0 || s === 10) tone('sine', 120, 45, t, 0.16, 0.4, musicGain); // yumuşak kick
            if (s % 4 === 2) noiseHit(t, 0.04, 0.06, 'highpass', 8000, 0, musicGain); // hi-hat
            // Arpej: her 8. ölçüde susar ki döngü tekdüze olmasın
            const rest = Math.floor(step / 128) % 4 === 3;
            if (!rest && s % 2 === 0) {
                const n = chord[1 + ((s >> 1) % 4)] * 2;
                tone('triangle', n, n, t, STEP_S * 1.4, 0.03, musicGain, 0.005);
            }
            nextStepTime += STEP_S;
            step++;
        }
    }

    return {
        unlock() {
            if (isMuted) return;
            const c = ensure();
            if (canResume(c)) c.resume().catch(() => {});
        },
        play(name, arg) {
            if (!ready()) return;
            const fn = SOUNDS[name];
            if (!fn) return;
            try {
                fn(ctx.currentTime + 0.005, arg);
            } catch {
                // Ses hatası oyunu durdurmamalı.
            }
        },
        setMusic(on) {
            musicOn = Boolean(on);
            if (musicOn && ctx) nextStepTime = ctx.currentTime + 0.05;
        },
        tick() {
            if (!musicOn || !musicEnabled || !ready()) return;
            try {
                scheduleMusic();
            } catch {
                musicOn = false;
            }
        },
        setMuted(m) {
            isMuted = Boolean(m);
            if (isMuted) {
                if (master) master.gain.value = 0;
            } else {
                const c = ensure();
                if (c) {
                    master.gain.value = MASTER;
                    if (canResume(c)) c.resume().catch(() => {});
                    nextStepTime = c.currentTime + 0.05;
                }
            }
        },
        setMusicEnabled(on) {
            const next = Boolean(on);
            if (next === musicEnabled) return;
            musicEnabled = next;
            if (musicGain) musicGain.gain.value = musicEnabled ? MUSIC : 0;
            if (musicEnabled && ctx) nextStepTime = ctx.currentTime + 0.05;
        },
        isMusicEnabled() {
            return musicEnabled;
        },
        suspend() {
            if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
        },
        resume() {
            if (ctx && !isMuted && canResume(ctx)) ctx.resume().catch(() => {});
            if (ctx) nextStepTime = ctx.currentTime + 0.05;
        },
        dispose() {
            closed = true;
            musicOn = false;
            if (ctx) {
                const c = ctx;
                ctx = null;
                c.close().catch(() => {});
            }
        },
    };
}
