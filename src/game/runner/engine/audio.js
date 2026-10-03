/*
 * WebAudio ile sentezlenmiş ses efektleri ve hafif ritmik arka plan döngüsü.
 * Hiç ses dosyası yok; her ses birkaç osilatör/gürültü düğümünden kurulur.
 *
 * AudioContext ilk kullanıcı etkileşiminde (start/girdi) açılır; tarayıcılar
 * etkileşimsiz sesi engelliyor. Sessizde düğüm bile oluşturulmaz.
 * Duraklatmada bağlam askıya alınır; destroy'da kapatılır.
 * Müzik ayrıca kapatılabilir (musicEnabled): efektler çalmaya devam eder.
 */

const MASTER = 0.55;
const MUSIC = 0.13;
const BPM = 112;
const STEP_S = 60 / BPM / 4; // 16'lık
// Am - F - C - G (her biri 1 ölçü), bas ve arpej notaları (Hz)
const CHORDS = [
    [110.0, 220.0, 261.63, 329.63],
    [87.31, 174.61, 220.0, 261.63],
    [130.81, 261.63, 329.63, 392.0],
    [98.0, 196.0, 246.94, 293.66],
];

// iOS WebKit, ses oturumu kesilince (arama, Siri, başka uygulama) standart
// dışı 'interrupted' durumunu raporlar; o da resume() ile geri gelir.
export const canResume = (c) => Boolean(c) && (c.state === 'suspended' || c.state === 'interrupted');

export function createAudio({ muted = false, musicEnabled: musicEnabledIn = true } = {}) {
    let ctx = null;
    let master = null;
    let musicGain = null;
    let sfxGain = null;
    let noise = null;
    let isMuted = Boolean(muted);
    let musicEnabled = Boolean(musicEnabledIn);
    let closed = false;
    let musicOn = false;
    let nextStepTime = 0;
    let step = 0;
    let coinStreak = 0;
    let lastCoinAt = 0;
    let echoWet = null;
    let echoAmount = 0;

    function ensure() {
        if (closed) return null;
        if (ctx) return ctx;
        const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!AC) return null;
        try {
            ctx = new AC();
        } catch {
            ctx = null;
            return null;
        }
        master = ctx.createGain();
        master.gain.value = isMuted ? 0 : MASTER;
        // Hafif kompresör: üst üste binen sesler patlamasın.
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
        // Tünel yankısı: efektler ve müzik kısa bir geri beslemeli gecikmeden geçer
        // (ıslak kazanç tünel dışında 0).
        // Yankı zorunlu değil: düğüm kurulamazsa sessizce atlanır.
        try {
            const delay = ctx.createDelay(1);
            delay.delayTime.value = 0.12;
            const feedback = ctx.createGain();
            feedback.gain.value = 0.38;
            const damp = ctx.createBiquadFilter();
            damp.type = 'lowpass';
            damp.frequency.value = 2600;
            const wet = ctx.createGain();
            wet.gain.value = echoAmount * 0.5;
            sfxGain.connect(delay);
            musicGain.connect(delay);
            delay.connect(damp);
            damp.connect(feedback);
            feedback.connect(delay);
            damp.connect(wet);
            wet.connect(master);
            echoWet = wet;
        } catch {
            echoWet = null;
        }
        // 1 sn beyaz gürültü (kayma, çarpma, hi-hat)
        noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noise.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < data.length; i++) {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            data[i] = (seed / 0x7fffffff) * 2 - 1;
        }
        return ctx;
    }

    function ready() {
        return ctx && !isMuted && !closed && ctx.state === 'running';
    }

    function tone(type, f0, f1, t0, dur, vol, out = sfxGain) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, t0);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
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
        g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(f);
        f.connect(g);
        g.connect(out);
        src.start(t0, Math.random() * 0.5);
        src.stop(t0 + dur + 0.02);
    }

    const SOUNDS = {
        coin(t) {
            // Art arda jetonlarda perde yükselir (en fazla 8 basamak).
            const now = ctx.currentTime;
            coinStreak = now - lastCoinAt < 0.6 ? Math.min(coinStreak + 1, 8) : 0;
            lastCoinAt = now;
            const base = 988 * Math.pow(2, coinStreak / 12);
            tone('square', base, base, t, 0.06, 0.07);
            tone('square', base * 1.5, base * 1.5, t + 0.05, 0.12, 0.07);
        },
        jump(t) {
            tone('square', 300, 720, t, 0.16, 0.08);
            tone('sine', 150, 360, t, 0.14, 0.1);
        },
        slide(t) {
            noiseHit(t, 0.28, 0.22, 'bandpass', 1800, 500);
        },
        lane(t) {
            noiseHit(t, 0.1, 0.12, 'highpass', 2500, 5000);
        },
        land(t) {
            tone('sine', 140, 60, t, 0.1, 0.12);
        },
        // Araç çatısına iniş: tok gümleme + metalik çın
        landRoof(t) {
            tone('sine', 110, 45, t, 0.16, 0.3);
            noiseHit(t, 0.12, 0.16, 'lowpass', 1400, 300);
            tone('triangle', 620, 540, t + 0.01, 0.14, 0.05);
        },
        // Süper Zıplama: yükselen parıltılı süpürme
        superJump(t) {
            tone('square', 260, 1040, t, 0.28, 0.07);
            tone('sine', 520, 1560, t + 0.04, 0.3, 0.08);
            [1318.5, 1568, 2093].forEach((f, i) => tone('triangle', f, f, t + 0.1 + i * 0.05, 0.12, 0.04));
        },
        fall(t) {
            noiseHit(t, 0.22, 0.08, 'bandpass', 900, 2400);
        },
        power(t) {
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone('triangle', f, f, t + i * 0.06, 0.18, 0.12));
        },
        correct(t) {
            [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone('square', f, f, t + i * 0.07, 0.16, 0.07));
            tone('sine', 1318.5, 1318.5, t + 0.28, 0.4, 0.08);
        },
        wrong(t) {
            tone('sawtooth', 330, 196, t, 0.32, 0.08);
            tone('sawtooth', 311, 185, t + 0.12, 0.36, 0.07);
        },
        stumble(t) {
            tone('sine', 180, 70, t, 0.18, 0.25);
            noiseHit(t, 0.12, 0.18, 'lowpass', 900, 200);
        },
        shieldBreak(t) {
            noiseHit(t, 0.35, 0.25, 'highpass', 3000, 8000);
            tone('triangle', 1200, 300, t, 0.3, 0.08);
        },
        crash(t) {
            noiseHit(t, 0.6, 0.45, 'lowpass', 2400, 120);
            tone('sine', 120, 40, t, 0.5, 0.4);
            tone('square', 220, 55, t + 0.05, 0.45, 0.06);
        },
        count(t) {
            tone('sine', 660, 660, t, 0.14, 0.14);
        },
        go(t) {
            tone('sine', 990, 990, t, 0.3, 0.16);
            tone('triangle', 1320, 1320, t, 0.3, 0.06);
        },
        gate(t) {
            tone('sine', 520, 1040, t, 0.25, 0.08);
        },
    };

    function scheduleMusic() {
        const ahead = ctx.currentTime + 0.15;
        if (nextStepTime < ctx.currentTime - 0.05) nextStepTime = ctx.currentTime + 0.02;
        while (nextStepTime < ahead) {
            const t = nextStepTime;
            const s = step % 16;
            const chord = CHORDS[Math.floor(step / 16) % CHORDS.length];
            if (s % 4 === 0) tone('sine', 140, 45, t, 0.18, 0.55, musicGain); // kick
            if (s % 4 === 2) noiseHit(t, 0.05, 0.12, 'highpass', 7000, 0, musicGain); // hi-hat
            if (s === 4 || s === 12) noiseHit(t, 0.12, 0.18, 'bandpass', 1800, 900, musicGain); // trampet
            if (s % 2 === 0) tone('triangle', chord[0], chord[0], t, STEP_S * 1.6, 0.22, musicGain); // bas
            // Döngü 8.6 sn'de bir aynen tekrarlamasın: her 4. turda arpej susar.
            const arpRest = Math.floor(step / 64) % 4 === 3;
            if (!arpRest && (s % 2 === 1 || s % 4 === 0)) {
                const n = chord[1 + ((s >> 1) % 3)] * 2;
                tone('square', n, n, t, STEP_S * 0.9, 0.035, musicGain); // arpej
            }
            nextStepTime += STEP_S;
            step++;
        }
    }

    return {
        /** Kullanıcı etkileşiminde çağrılır: bağlamı aç/sürdür. */
        unlock() {
            if (isMuted) return;
            const c = ensure();
            if (canResume(c)) c.resume().catch(() => {});
        },
        play(name) {
            if (!ready()) return;
            const fn = SOUNDS[name];
            if (!fn) return;
            try {
                fn(ctx.currentTime + 0.005);
            } catch {
                // Ses hatası oyunu durdurmamalı.
            }
        },
        setMusic(on) {
            musicOn = Boolean(on);
            if (musicOn && ctx) nextStepTime = ctx.currentTime + 0.05;
        },
        /** Her karede çağrılır: müzik notalarını 150 ms ileriye planlar. */
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
        /** Yalnızca arka plan müziğini aç/kapat; efektler etkilenmez. */
        setMusicEnabled(on) {
            const next = Boolean(on);
            if (next === musicEnabled) return;
            musicEnabled = next;
            if (musicGain) musicGain.gain.value = musicEnabled ? MUSIC : 0;
            // Yeniden açılınca geçmişe planlama yapma; şimdiden devam et.
            if (musicEnabled && ctx) nextStepTime = ctx.currentTime + 0.05;
        },
        isMusicEnabled() {
            return musicEnabled;
        },
        /** Tünel yankısı: 0 (yok) .. 1 (tünel içi). */
        setEcho(amount) {
            const a = amount > 0 ? Math.min(1, amount) : 0;
            if (Math.abs(a - echoAmount) < 0.02) return;
            echoAmount = a;
            if (echoWet && ctx) {
                try {
                    echoWet.gain.setTargetAtTime(a * 0.5, ctx.currentTime, 0.12);
                } catch {
                    echoWet.gain.value = a * 0.5;
                }
            }
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
