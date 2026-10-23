/*
 * KEŞİF ses — TEKNOLOJİ tarifleri (audioRecipes.js'e reg ile eklenir). Dosya yok; osilatör + gürültü + süzgeç.
 *
 *   tech:hum            makine uğultusu (çok kısa, düşük; yakındaki etkin makineler aralıklı çalar)
 *   tech:power_on / tech:power_off   lamba/kapı/ocak enerjilenince: ince "tık" + yükselen / alçalan vızıltı
 *   tech:generator      jeneratör yanmaya başlar: gümleme + kıvılcım
 *   tech:drill          madenci bir blok kırdı: tok darbe + metal çınlama
 *   tech:charge         Pil/Şarj istasyonundan eşyalar doldu: yükselen üç notalı çınlama
 *   tech:teleport       ışınlanma: kısa şarj tonu + kuantum "pat" + parıltı
 *   tech:lift           asansör: motor süpürmesi
 *   tech:deny           makine reddi (enerji yok, hedef yok): donuk iki ton
 *   tech:jetpack        jetpack itişi (kısa gürültü patlaması; basılıyken yeniden tetiklenir)
 *   tech:jetpack_empty  yakıt bitti: tıkırdayan hışırtı
 *   tech:scan           tarama darbesi: yükselen "sonar" + yansıma
 *   tech:blip           bulunan hedef: kısa tek ton (yakın cevher)
 *   tech:shield         enerji kalkanı hasarı emdi: cızırtılı kalkan "zınk"
 *   tech:portal_blue / tech:portal_orange   portal atışı (iki perde: mavi tiz, turuncu pes)
 *   tech:portal_enter / tech:portal_exit    portaldan giriş / çıkış "vuuum"
 *   tech:portal_hum     açık portal uğultusu (çok sessiz, kısa)
 *   tech:portal_fail    portal açılamadı: alçalan kısa "bzzt"
 */
export const TECH_SOUNDS = [
  ['tech:hum', (s) => {
    s.tone('sawtooth', 55, 55, 0, 0.7, 0.05, 0.12, { filter: ['lowpass', 220, 1.2] });
    s.tone('sine', 110, 112, 0, 0.7, 0.05, 0.14);
    s.noise(0, 0.6, 0.02, 'bandpass', 420, 380, 2, 0.15);
  }, { p: 1, r: 14, gap: 0.5 }],
  ['tech:power_on', (s) => {
    s.noise(0, 0.03, 0.3, 'bandpass', 2400, 2400, 2, 0.001);
    s.tone('sawtooth', 120, 520, 0.01, 0.2, 0.08, 0.02, { filter: ['lowpass', 1500, 1.5] });
    s.tone('sine', 880, 1320, 0.1, 0.12, 0.07, 0.004);
  }, { p: 2, r: 26, gap: 0.25 }],
  ['tech:power_off', (s) => {
    s.noise(0, 0.03, 0.26, 'bandpass', 1800, 1800, 2, 0.001);
    s.tone('sawtooth', 420, 90, 0.01, 0.24, 0.07, 0.01, { filter: ['lowpass', 1200, 1.2] });
  }, { p: 2, r: 26, gap: 0.25 }],
  ['tech:generator', (s) => {
    s.tone('sine', 95, 45, 0, 0.35, 0.55, 0.004);
    s.noise(0, 0.3, 0.3, 'lowpass', 1400, 200, 1, 0.004, 'brown');
    for (let i = 0; i < 4; i++) s.noise(0.08 + i * 0.05, 0.03, 0.18, 'bandpass', s.rr(2200, 4200), s.rr(1400, 2400), 2, 0.001);
  }, { p: 3, r: 28, gap: 0.4 }],
  ['tech:drill', (s) => {
    s.tone('sine', 140, 60, 0, 0.12, 0.5, 0.003);
    s.noise(0, 0.1, 0.35, 'bandpass', 1800, 900, 1.5, 0.002);
    s.tone('triangle', 640, 520, 0.02, 0.2, 0.06, 0.003);
  }, { p: 2, r: 22, gap: 0.18 }],
  ['tech:charge', (s) => {
    [660, 880, 1320].forEach((f, i) => {
      s.tone('sine', f, f * 1.01, i * 0.08, 0.35, 0.1, 0.004);
      s.tone('triangle', f * 2, f * 2, i * 0.08, 0.2, 0.03, 0.004);
    });
    s.noise(0, 0.3, 0.08, 'highpass', 4200, 7000, 1, 0.1);
  }, { p: 3, r: Infinity, wet: 0.25, gap: 0.3 }],
  ['tech:teleport', (s) => {
    s.tone('sine', 180, 1500, 0, 0.35, 0.16, 0.02, { vib: { hz: 9, cents: 30 } });
    s.tone('sawtooth', 90, 700, 0, 0.3, 0.05, 0.03, { filter: ['lowpass', 2200, 1] });
    s.tone('sine', 1800, 300, 0.32, 0.4, 0.14, 0.004);
    s.noise(0.3, 0.5, 0.2, 'bandpass', 4200, 900, 1.2, 0.01);
    s.tone('sine', 70, 40, 0.3, 0.3, 0.45, 0.004);
  }, { p: 4, r: 60, wet: 0.35, gap: 0.5 }],
  ['tech:lift', (s) => {
    s.tone('sawtooth', 70, 150, 0, 0.5, 0.07, 0.05, { filter: ['lowpass', 520, 1.5] });
    s.tone('sine', 220, 360, 0.05, 0.4, 0.06, 0.05);
    s.noise(0, 0.5, 0.09, 'bandpass', 600, 1400, 1.5, 0.08);
  }, { p: 3, r: 40, wet: 0.2, gap: 0.5 }],
  ['tech:deny', (s) => {
    s.tone('square', 220, 200, 0, 0.1, 0.07, 0.004, { filter: ['lowpass', 900, 1] });
    s.tone('square', 165, 150, 0.11, 0.14, 0.07, 0.004, { filter: ['lowpass', 900, 1] });
  }, { p: 2, r: 18, gap: 0.3 }],
  ['tech:jetpack', (s) => {
    s.noise(0, 0.16, 0.34, 'bandpass', 900, 1500, 0.8, 0.012);
    s.noise(0, 0.18, 0.16, 'lowpass', 520, 300, 0.7, 0.012, 'brown');
    s.tone('sawtooth', 70, 62, 0, 0.16, 0.06, 0.02, { filter: ['lowpass', 260, 1] });
  }, { p: 2, r: 36, gap: 0.11 }],
  ['tech:jetpack_empty', (s) => {
    for (let i = 0; i < 4; i++) s.noise(i * 0.06, 0.04, 0.22, 'bandpass', s.rr(700, 1500), s.rr(300, 700), 2, 0.002);
    s.tone('sawtooth', 180, 60, 0, 0.3, 0.05, 0.01, { filter: ['lowpass', 400, 1] });
  }, { p: 3, r: 30, gap: 0.8 }],
  ['tech:scan', (s) => {
    s.tone('sine', 420, 1900, 0, 0.45, 0.12, 0.01);
    s.tone('triangle', 840, 3800, 0.02, 0.35, 0.04, 0.01);
    s.tone('sine', 1900, 1900, 0.5, 0.35, 0.06, 0.004);
    s.tone('sine', 1900, 1900, 0.62, 0.3, 0.03, 0.004);
    s.noise(0.02, 0.4, 0.05, 'highpass', 5200, 8000, 1, 0.05);
  }, { p: 3, r: Infinity, wet: 0.35, gap: 0.5 }],
  ['tech:blip', (s) => {
    s.tone('sine', 1560, 1560, 0, 0.1, 0.1, 0.003);
    s.tone('sine', 2340, 2340, 0.05, 0.12, 0.06, 0.003);
  }, { p: 2, r: Infinity, gap: 0.08 }],
  ['tech:shield', (s) => {
    s.tone('sine', 1400, 520, 0, 0.18, 0.16, 0.003);
    s.noise(0, 0.14, 0.2, 'bandpass', 3800, 1600, 2, 0.002);
    s.tone('triangle', 2100, 900, 0.01, 0.1, 0.05, 0.002);
  }, { p: 3, r: Infinity, gap: 0.12 }],
  ['tech:portal_blue', (s) => {
    s.tone('sine', 520, 1500, 0, 0.18, 0.15, 0.006);
    s.tone('triangle', 1040, 2800, 0.01, 0.14, 0.05, 0.004);
    s.noise(0, 0.2, 0.12, 'highpass', 4200, 7600, 1, 0.01);
    s.tone('sine', 1500, 1500, 0.17, 0.2, 0.08, 0.004, { vib: { hz: 8, cents: 20 } });
  }, { p: 3, r: 50, wet: 0.3, gap: 0.12 }],
  ['tech:portal_orange', (s) => {
    s.tone('sine', 360, 980, 0, 0.2, 0.16, 0.006);
    s.tone('triangle', 720, 1960, 0.01, 0.16, 0.05, 0.004);
    s.noise(0, 0.22, 0.12, 'highpass', 3400, 6200, 1, 0.01);
    s.tone('sine', 980, 980, 0.18, 0.22, 0.08, 0.004, { vib: { hz: 6, cents: 25 } });
  }, { p: 3, r: 50, wet: 0.3, gap: 0.12 }],
  ['tech:portal_enter', (s) => {
    s.tone('sine', 900, 120, 0, 0.35, 0.2, 0.01, { vib: { hz: 7, cents: 40 } });
    s.noise(0, 0.4, 0.28, 'bandpass', 3200, 300, 1.4, 0.02);
    s.tone('sine', 60, 38, 0.02, 0.25, 0.4, 0.004);
  }, { p: 4, r: 60, wet: 0.35, gap: 0.3 }],
  ['tech:portal_exit', (s) => {
    s.tone('sine', 140, 1100, 0, 0.35, 0.2, 0.01, { vib: { hz: 7, cents: 40 } });
    s.noise(0, 0.4, 0.28, 'bandpass', 300, 3600, 1.4, 0.02);
    s.tone('sine', 1100, 1100, 0.34, 0.2, 0.06, 0.004);
  }, { p: 4, r: 60, wet: 0.35, gap: 0.3 }],
  ['tech:portal_hum', (s) => {
    s.tone('sine', 190, 205, 0, 0.8, 0.045, 0.2, { vib: { hz: 4, cents: 35 } });
    s.tone('triangle', 285, 300, 0, 0.8, 0.02, 0.2, { vib: { hz: 5, cents: 30 } });
    s.noise(0, 0.7, 0.018, 'bandpass', 1400, 1900, 1.5, 0.2);
  }, { p: 1, r: 16, gap: 0.8 }],
  ['tech:portal_fail', (s) => {
    s.tone('sawtooth', 340, 90, 0, 0.16, 0.08, 0.004, { filter: ['lowpass', 1200, 1] });
    s.noise(0, 0.08, 0.12, 'bandpass', 2400, 900, 2, 0.002);
  }, { p: 2, r: 30, gap: 0.2 }],
];
