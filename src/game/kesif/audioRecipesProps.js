/*
 * KEŞİF ses — İÇ MEKÂN PROP SESLERİ (props_content). audioRecipes.js'e reg ile eklenir (audioRecipesDim.js deseni). Dosya yok; osilatör + gürültü.
 * Aile dostu: yalnız yumuşak tıklama/vızıltı/baloncuk/bip. Kullanım sesleri (< 1 sn) propBehaviorsInterior efektlerinden; ortam sesleri
 * (≤ 2,8 sn, ≤ 4 düğüm) systems/propsAmbient.js tarafından en yakın en çok 3 prop için aralıklı çalınır.
 *
 *   prop:sit prop:door prop:door_shut prop:locked prop:beep prop:drawer prop:power_on prop:power_off          (kullanım)
 *   prop:fridge_hum prop:arcade prop:bubbles prop:server prop:steam prop:vending prop:shower                (ortam)
 */
export const PROP_AMBIENT_SOUNDS = Object.freeze([
  'prop:fridge_hum', 'prop:arcade', 'prop:bubbles', 'prop:server', 'prop:steam', 'prop:vending', 'prop:shower',
]);

export const PROP_SOUNDS = [
  // ---- kullanım efektleri (< 1 sn, konumlu) ----
  ['prop:sit', (s) => {
    s.tone('sine', 150, 80, 0, 0.2, 0.2, 0.01);
    s.noise(0, 0.22, 0.08, 'lowpass', 1400, 400, 0.8, 0.02);
  }, { p: 2, r: 16, gap: 0.2 }],
  ['prop:door', (s) => {
    s.noise(0, 0.34, 0.12, 'bandpass', 2400, 700, 1.1, 0.03);
    s.tone('triangle', 180, 120, 0, 0.3, 0.07, 0.02);
    s.tone('sine', 1320, 1320, 0.28, 0.1, 0.05, 0.004);
  }, { p: 3, r: 24, wet: 0.15, gap: 0.2 }],
  ['prop:door_shut', (s) => {
    s.noise(0, 0.28, 0.1, 'bandpass', 1500, 500, 1, 0.02);
    s.tone('sine', 120, 62, 0.22, 0.14, 0.18, 0.004);
    s.tone('triangle', 900, 700, 0.24, 0.05, 0.05, 0.002);
  }, { p: 3, r: 24, wet: 0.15, gap: 0.2 }],
  ['prop:locked', (s) => {
    s.tone('square', 196, 196, 0, 0.09, 0.07, 0.004, { filter: ['lowpass', 900, 1] });
    s.tone('square', 147, 147, 0.12, 0.14, 0.07, 0.004, { filter: ['lowpass', 900, 1] });
  }, { p: 3, r: 20, gap: 0.3 }],
  ['prop:beep', (s) => {
    s.tone('sine', 880, 1180, 0, 0.1, 0.1, 0.004);
    s.tone('sine', 1760, 2000, 0.02, 0.07, 0.03, 0.004);
  }, { p: 2, r: 16, gap: 0.12 }],
  ['prop:drawer', (s) => {
    s.noise(0, 0.12, 0.1, 'bandpass', 900, 500, 1.4, 0.004);
    s.tone('sine', 200, 110, 0, 0.1, 0.12, 0.004);
    s.tone('triangle', 1400, 1000, 0.08, 0.03, 0.04, 0.002);
  }, { p: 2, r: 16, gap: 0.12 }],
  ['prop:power_on', (s) => {
    s.tone('sine', 440, 880, 0, 0.2, 0.1, 0.01);
    s.tone('triangle', 880, 1320, 0.08, 0.2, 0.05, 0.01);
    s.noise(0, 0.12, 0.03, 'highpass', 4000, 6000, 0.7, 0.01);
  }, { p: 2, r: 16, gap: 0.15 }],
  ['prop:power_off', (s) => {
    s.tone('sine', 660, 330, 0, 0.18, 0.09, 0.008);
    s.tone('triangle', 990, 440, 0.03, 0.16, 0.04, 0.008);
  }, { p: 2, r: 16, gap: 0.15 }],

  // ---- ortam sesleri ----
  ['prop:fridge_hum', (s) => {
    s.tone('sine', 58, 57, 0, 2.6, 0.06, 0.5);
    s.tone('sine', 116, 114, 0, 2.6, 0.025, 0.5);
    s.noise(0, 2.6, 0.012, 'lowpass', 260, 240, 0.8, 0.5, 'brown');
  }, { p: 1, r: 12, gap: 1.2 }],
  ['prop:arcade', (s) => {
    const sc = [523.25, 659.25, 783.99, 987.77, 1174.66];
    for (let i = 0; i < 4; i++) {
      const f = sc[Math.floor(s.rr(0, sc.length))];
      s.tone('square', f, f * 1.02, i * 0.22 + s.rr(0, 0.08), 0.1, 0.022, 0.004, { filter: ['lowpass', 3200, 0.8] });
    }
  }, { p: 1, r: 14, gap: 1.5 }],
  ['prop:bubbles', (s) => {
    for (let i = 0; i < 3; i++) {
      const f = s.rr(420, 900);
      s.tone('sine', f, f * 1.9, i * 0.5 + s.rr(0, 0.3), 0.12, 0.04, 0.008);
    }
    s.noise(0, 1.8, 0.01, 'bandpass', 1400, 900, 1.5, 0.4);
  }, { p: 1, r: 10, gap: 1 }],
  ['prop:server', (s) => {
    s.noise(0, 2.8, 0.03, 'bandpass', 700, 760, 1.3, 0.6, 'brown');
    s.tone('sine', 120, 121, 0, 2.8, 0.03, 0.6);
    s.noise(1 + s.rr(0, 1), 0.03, 0.02, 'highpass', 5000, 5000, 0.8, 0.002);
  }, { p: 1, r: 12, gap: 1 }],
  ['prop:steam', (s) => {
    s.noise(0, 2.4, 0.03, 'highpass', 3600, 5200, 0.8, 0.7);
    s.noise(0, 2.4, 0.02, 'bandpass', 1500, 1100, 0.9, 0.7);
  }, { p: 1, r: 12, gap: 0.8 }],
  ['prop:vending', (s) => {
    s.tone('sine', 100, 102, 0, 2.4, 0.03, 0.5);
    s.tone('sawtooth', 50, 51, 0, 2.4, 0.01, 0.5, { filter: ['lowpass', 220, 1] });
    s.tone('sine', 1760, 1760, 1.4 + s.rr(0, 0.6), 0.04, 0.012, 0.002);
  }, { p: 1, r: 9, gap: 1.6 }],
  ['prop:shower', (s) => {
    s.noise(0, 2.5, 0.06, 'bandpass', 3200, 3600, 0.7, 0.2);
    s.noise(0, 2.5, 0.03, 'highpass', 5200, 6400, 0.7, 0.2);
  }, { p: 1, r: 10, gap: 0.3 }],
];
