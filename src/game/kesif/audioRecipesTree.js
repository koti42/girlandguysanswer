/*
 * KEŞİF ses — AĞAÇ DEVİRME tarifleri (audioRecipes.js'e reg ile eklenir). Dosya yok; osilatör + gürültü + süzgeç.
 *
 *   tree:creak     gövde çatırtısı: alçalan ahşap inlemesi + lif çıtırtıları (devrilirken 2-3 kez çalınır)
 *   tree:snap      tek dal kırılması: kısa keskin çıt (devrilmenin ilk anı)
 *   tree:crash     yere çarpma: derin gümleme + yaprak/dal hışırtısı + art arda kırılan dallar
 *   tree:thud      ikinci küçük oturma (gövde yamaçta kayıp durunca)
 *   leaf:rustle    yaprak hışırtısı (taç sarsılırken, çürüyen yaprak düşerken)
 */
export const TREE_SOUNDS = [
  ['tree:creak', (s) => {
    s.tone('sawtooth', 190, 92, 0, 0.55, 0.11, 0.05, { filter: ['lowpass', 520, 2.4] });
    s.tone('triangle', 128, 66, 0.04, 0.6, 0.12, 0.06, { vib: { hz: 11, cents: 40 } });
    s.noise(0, 0.5, 0.2, 'bandpass', 420, 900, 3.2, 0.06);
    for (let i = 0; i < 4; i++) s.noise(0.08 + i * 0.1 + s.rr(0, 0.04), 0.03, 0.22, 'bandpass', s.rr(1400, 2800), s.rr(700, 1300), 2.2, 0.002);
  }, { p: 3, r: 56, wet: 0.12, gap: 0.5 }],
  ['tree:snap', (s) => {
    s.noise(0, 0.045, 0.7, 'bandpass', 2600, 1200, 1.4, 0.001);
    s.tone('triangle', 520, 210, 0, 0.07, 0.22, 0.001);
    s.noise(0.035, 0.05, 0.3, 'bandpass', 1800, 900, 2.5, 0.002);
  }, { p: 3, r: 48, gap: 0.12 }],
  ['tree:crash', (s) => {
    s.tone('sine', 96, 34, 0, 0.7, 0.85, 0.004);
    s.tone('sine', 54, 28, 0.02, 0.9, 0.6, 0.006);
    s.noise(0, 0.6, 0.7, 'lowpass', 2200, 180, 0.9, 0.003, 'brown');
    s.noise(0.02, 0.85, 0.34, 'bandpass', 3400, 900, 0.9, 0.04);
    for (let i = 0; i < 7; i++) s.noise(0.05 + i * 0.07 + s.rr(0, 0.05), 0.04, 0.32, 'bandpass', s.rr(1200, 3000), s.rr(500, 1100), 2, 0.001);
  }, { p: 4, r: 80, wet: 0.28, gap: 0.2 }],
  ['tree:thud', (s) => {
    s.tone('sine', 82, 36, 0, 0.35, 0.6, 0.004);
    s.noise(0, 0.28, 0.4, 'lowpass', 1500, 200, 0.8, 0.003, 'brown');
  }, { p: 3, r: 48, gap: 0.2 }],
  ['leaf:rustle', (s) => {
    s.noise(0, 0.4, 0.2, 'bandpass', 3200, 5200, 1.1, 0.05);
    s.noise(0.06, 0.3, 0.14, 'highpass', 4800, 6800, 0.8, 0.06);
  }, { p: 1, r: 26, gap: 0.25 }],
];
