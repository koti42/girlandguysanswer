/*
 * KEŞİF ses — BÜYÜ tarifleri (audioRecipes.js'e reg ile eklenir). Dosya yok; osilatör + gürültü + süzgeç.
 *
 *   enchant            Büyü Masası: yükselen çan dizisi + parıltı (konumsuz da çalınır)
 *   spell:fire:cast / spell:fire:impact      ateş topu: hışırtılı alev patlaması / gümleme + kor çıtırtısı
 *   spell:ice:cast / spell:ice:impact        buz mızrağı: tiz ıslık / cam kırılması
 *   spell:heal:cast                          şifa: yumuşak yükselen üçlü
 *   spell:blink:cast / spell:blink:impact    sıçrayış: ters süpürme / varış "vınlaması"
 *   potion_drink       iksir içme: yutkunma + kabarcık
 *   brew_bubble        kazan kabarcığı (kısa, sık tekrarlanabilir)
 *   brew_done          iksir hazır: iki notalı çan
 *   mana_low           mana yetersiz: alçalan donuk uyarı
 */
export const MAGIC_SOUNDS = [
  ['enchant', (s) => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      s.tone('sine', f, f, i * 0.07, 0.8, 0.14, 0.004);
      s.tone('triangle', f * 2.005, f * 2.005, i * 0.07, 0.5, 0.045, 0.004);
    });
    s.tone('sine', 98, 140, 0, 0.5, 0.3, 0.02);
    s.noise(0.05, 0.9, 0.12, 'bandpass', 1800, 6200, 2.5, 0.2);
    s.tone('sine', 2093, 2093, 0.4, 1.0, 0.05, 0.1, { vib: { hz: 5, cents: 25 } });
  }, { p: 4, r: Infinity, wet: 0.5 }],
  ['spell:fire:cast', (s) => {
    s.noise(0, 0.35, 0.4, 'bandpass', 500, 2600, 1.2, 0.02);
    s.tone('sawtooth', 160, 420, 0, 0.3, 0.1, 0.02, { filter: ['lowpass', 1400, 1] });
    s.tone('sine', 90, 55, 0, 0.3, 0.3, 0.01);
  }, { p: 3, r: 40, wet: 0.2, gap: 0.12 }],
  ['spell:fire:impact', (s) => {
    s.tone('sine', 120, 40, 0, 0.5, 0.7, 0.003);
    s.noise(0, 0.5, 0.55, 'lowpass', 1800, 200, 0.8, 0.003, 'brown');
    s.noise(0.04, 0.4, 0.22, 'bandpass', 3200, 900, 1.5, 0.01);
    for (let i = 0; i < 4; i++) s.tone('sine', s.rr(1400, 2600), s.rr(500, 900), 0.12 + i * 0.07, 0.05, 0.07, 0.002);
  }, { p: 4, r: 50, wet: 0.3, gap: 0.08 }],
  ['spell:ice:cast', (s) => {
    s.noise(0, 0.22, 0.26, 'highpass', 4200, 8200, 1.2, 0.01);
    s.tone('sine', 1500, 3400, 0, 0.18, 0.14, 0.006);
    s.tone('triangle', 2200, 4400, 0.02, 0.12, 0.06, 0.004);
  }, { p: 3, r: 40, wet: 0.2, gap: 0.1 }],
  ['spell:ice:impact', (s) => {
    s.noise(0, 0.12, 0.5, 'highpass', 3200, 3200, 0.7, 0.001);
    [2300, 3100, 3900, 5200].forEach((f, i) => s.tone('sine', f, f * 0.96, i * 0.025, 0.22, 0.09, 0.002));
    s.tone('sine', 220, 120, 0, 0.12, 0.3, 0.003);
  }, { p: 3, r: 40, wet: 0.3, gap: 0.06 }],
  ['spell:heal:cast', (s) => {
    [392.0, 493.88, 587.33, 783.99].forEach((f, i) => {
      s.tone('sine', f, f, i * 0.08, 0.6, 0.15, 0.01);
      s.tone('triangle', f * 2, f * 2, i * 0.08, 0.4, 0.04, 0.01);
    });
    s.noise(0, 0.6, 0.06, 'bandpass', 2400, 5200, 2, 0.15);
  }, { p: 3, r: 40, wet: 0.45 }],
  ['spell:blink:cast', (s) => {
    s.tone('sine', 1600, 160, 0, 0.22, 0.2, 0.004);
    s.noise(0, 0.22, 0.3, 'bandpass', 4800, 400, 2.2, 0.01);
    s.tone('triangle', 3200, 600, 0, 0.16, 0.05, 0.003);
  }, { p: 3, r: 40, wet: 0.35, gap: 0.1 }],
  ['spell:blink:impact', (s) => {
    s.tone('sine', 220, 1800, 0, 0.2, 0.18, 0.004);
    s.noise(0.04, 0.3, 0.22, 'bandpass', 600, 5200, 1.6, 0.01);
    s.tone('sine', 1318.5, 1318.5, 0.12, 0.3, 0.08, 0.01);
  }, { p: 3, r: 40, wet: 0.4, gap: 0.1 }],
  ['potion_drink', (s) => {
    for (let i = 0; i < 3; i++) {
      s.tone('sine', s.rr(130, 190), s.rr(70, 100), i * 0.17, 0.1, 0.32, 0.005);
      s.noise(i * 0.17, 0.08, 0.1, 'bandpass', 700, 1500, 2, 0.004);
    }
    s.tone('sine', 700, 1500, 0.55, 0.07, 0.1, 0.003);
    s.tone('sine', 880, 1760, 0.66, 0.1, 0.06, 0.003);
  }, { p: 2, r: 25, gap: 0.3 }],
  ['brew_bubble', (s) => {
    s.tone('sine', s.rr(300, 520), s.rr(700, 1200), 0, 0.09, 0.14, 0.004);
    if (s.rand() < 0.5) s.tone('sine', s.rr(500, 800), s.rr(900, 1500), 0.07, 0.06, 0.08, 0.003);
    s.noise(0, 0.1, 0.05, 'bandpass', 900, 1700, 2, 0.01);
  }, { p: 1, r: 16, gap: 0.15 }],
  ['brew_done', (s) => {
    s.tone('sine', 1046.5, 1046.5, 0, 0.7, 0.14, 0.004);
    s.tone('sine', 1568, 1568, 0.16, 0.9, 0.12, 0.004);
    s.tone('triangle', 2093, 2093, 0.16, 0.5, 0.04, 0.004);
  }, { p: 3, r: 24, wet: 0.35 }],
  ['mana_low', (s) => {
    s.tone('triangle', 340, 220, 0, 0.22, 0.2, 0.01, { filter: ['lowpass', 900, 1] });
    s.tone('sine', 170, 110, 0.04, 0.26, 0.2, 0.01);
  }, { p: 2, r: Infinity, gap: 0.4 }],
];
