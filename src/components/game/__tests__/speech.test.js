// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, estimateSpeechMs, isSpeechSupported, SPEECH_MAX_MS } from '../speech';

describe('seslendirme yardımcısı', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('okuma süresi tahmini metin uzunluğuyla artar ve üst sınırda kalır', () => {
        expect(estimateSpeechMs('')).toBe(0);
        expect(estimateSpeechMs('Merhaba')).toBeGreaterThan(700);
        expect(estimateSpeechMs('a'.repeat(5000))).toBe(SPEECH_MAX_MS);
    });

    it('destek yoksa onEnd hemen çağrılır ve false döner', () => {
        const win = {};
        expect(isSpeechSupported(win)).toBe(false);
        const sp = createSpeaker({ win });
        const onEnd = vi.fn();
        expect(sp.speak('Soru 1', { onEnd })).toBe(false);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('speechSynthesis varsa okur, onend ile biter; yeni okuma öncekini iptal eder', () => {
        const spoken = [];
        class Utt {
            constructor(text) {
                this.text = text;
            }
        }
        const win = {
            SpeechSynthesisUtterance: Utt,
            speechSynthesis: {
                speak: vi.fn((u) => spoken.push(u)),
                cancel: vi.fn(),
            },
        };
        const sp = createSpeaker({ win });
        expect(sp.supported).toBe(true);
        const end1 = vi.fn();
        const end2 = vi.fn();
        expect(sp.speak('Birinci soru', { onEnd: end1 })).toBe(true);
        expect(spoken[0].lang).toBe('tr-TR');
        sp.speak('İkinci soru', { onEnd: end2 });
        expect(win.speechSynthesis.cancel).toHaveBeenCalled();
        expect(end1).toHaveBeenCalledTimes(1);
        spoken[1].onend();
        expect(end2).toHaveBeenCalledTimes(1);
        // İkinci kez onend / zamanlayıcı: tekrar çağrılmaz.
        spoken[1].onend();
        vi.runAllTimers();
        expect(end2).toHaveBeenCalledTimes(1);
    });

    it('onend gelmezse güvenlik zamanlayıcısı bitirir', () => {
        const win = {
            SpeechSynthesisUtterance: class { constructor(t) { this.text = t; } },
            speechSynthesis: { speak: vi.fn(), cancel: vi.fn() },
        };
        const sp = createSpeaker({ win });
        const onEnd = vi.fn();
        sp.speak('Soru', { onEnd, maxMs: 2000 });
        vi.advanceTimersByTime(1999);
        expect(onEnd).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('native köprü varsa speak mesajı gönderir ve tahmini sürede biter', () => {
        const posted = [];
        const win = { ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) } };
        const sp = createSpeaker({ win });
        const onEnd = vi.fn();
        sp.speak('Kapı 1: Soru metni', { onEnd });
        expect(posted[posted.length - 1]).toEqual({ type: 'speak', text: 'Kapı 1: Soru metni' });
        vi.advanceTimersByTime(estimateSpeechMs('Kapı 1: Soru metni') + 1);
        expect(onEnd).toHaveBeenCalledTimes(1);
        sp.cancel();
        expect(posted[posted.length - 1]).toEqual({ type: 'speakStop' });
    });

    it('enabled=false iken hiç okumaz ama akışı bitirir', () => {
        const win = { speechSynthesis: { speak: vi.fn(), cancel: vi.fn() }, SpeechSynthesisUtterance: class {} };
        const sp = createSpeaker({ win, enabled: false });
        const onEnd = vi.fn();
        expect(sp.speak('x', { onEnd })).toBe(false);
        expect(win.speechSynthesis.speak).not.toHaveBeenCalled();
        expect(onEnd).toHaveBeenCalledTimes(1);
    });
});
