/*
 * KEŞİF render/props — İÇ MEKÂN GEOMETRİSİ 4/4: kapılar, kilit düzenekleri, asansör düğmesi, posta kutusu, kod notu (9 model).
 * Model (b, v, h, x) → void. b = IGeo (setAnim ile kayan parçalar). Kapı durumları: 0 kapalı · 1 açık; yaprak SLIDE grubu (160+maske) açılış animasyonu.
 * Kilit düzenekleri: durum 0 bekliyor (turuncu) · 1 çözüldü (yeşil) · 2 soğuma/hata (kırmızı) — M.neonP maskeleriyle.
 */
import {
  C, M, SKIP, bar, chamfBox, dicePips, face,
} from './propGeoKit.js';

const ALL = 0b111;
const CLOSED = 0b001;
const OPEN = 0b010;

function doorLeafPair(b, half, h, palette) {
  // iki yaprak, ortadan ayrılıp yana kayar (gizli kalacağı yer duvar blokları)
  const sl = M.slide(ALL);
  const slN = (e) => M.slideNeon(ALL, e);
  [-1, 1].forEach((sgn) => {
    const x0 = sgn < 0 ? -half : 0.004;
    const x1 = sgn < 0 ? -0.004 : half;
    b.setAnim(sgn * half * 0.98, 0, 0);
    b.box(x0, 0.05, -0.07, x1, h - 0.14, 0.07, palette.leaf, sl, SKIP.NY);
    // göz hizası cam şeridi (koyu) + kenar neon
    b.box(x0 + (sgn < 0 ? 0.08 : 0.04), 1.4, 0.0705, x1 - (sgn < 0 ? 0.04 : 0.08), 2.2, 0.0715, C.glassDark, sl);
    b.box(sgn < 0 ? x1 - 0.03 : x0, 0.05, -0.075, sgn < 0 ? x1 : x0 + 0.03, h - 0.14, 0.075, palette.edge, slN(0.9));
    // alt panel çizgileri
    b.box(x0 + 0.06, 0.4, 0.0705, x1 - 0.06, 0.43, 0.0715, palette.line, sl);
    b.box(x0 + 0.06, 0.9, 0.0705, x1 - 0.06, 0.93, 0.0715, palette.line, sl);
    b.setAnim(0, 0, 0);
  });
}

function door(b, v, wide) {
  const half = wide ? 1.5 : 0.5;
  const pal = [
    { leaf: C.steelMid, edge: C.cyan, line: C.steelLight },
    { leaf: 0x3d4a70, edge: C.pink, line: C.steelLight },
    { leaf: 0x46605a, edge: C.green, line: C.steelLight },
  ][v % 3];
  // çerçeve
  b.box(-half - 0.0, 0, -0.125, -half + 0.1, 3.0, 0.125, C.steelDark, M.body, SKIP.NY);
  b.box(half - 0.1, 0, -0.125, half, 3.0, 0.125, C.steelDark, M.body, SKIP.NY);
  b.box(-half, 2.86, -0.125, half, 3.0, 0.125, C.steelDark, M.body, SKIP.NY);
  b.box(-half + 0.1, 0, -0.125, half - 0.1, 0.02, 0.125, C.black, M.body, SKIP.NY);
  face(b, -half + 0.1, 2.74, half - 0.1, 2.86, 0.126, 1, C.black, M.body);
  // durum ışığı: kapalıyken amber, açıkken yeşil
  b.box(-0.12, 2.78, 0.1265, 0.0, 2.82, 0.1275, C.orange, M.neonP(CLOSED, 0.7, 0), SKIP.NY);
  b.box(0.0, 2.78, 0.1265, 0.12, 2.82, 0.1275, C.green, M.neonP(OPEN, 0.7, 0), SKIP.NY);
  bar(b, -half + 0.1, 2.84, 0.126, half - 0.1, 2.86, 0.127, pal.edge, M.neon(0.7));
  bar(b, -half + 0.1, 2.84, -0.127, half - 0.1, 2.86, -0.126, pal.edge, M.neon(0.7));
  // iki taraftan okunur yaprak
  doorLeafPair(b, half - 0.1 + 0.1, 3.0, pal);
}

function kapi(b, v) {
  door(b, v, false);
}

function kapiGenis(b, v) {
  door(b, v, true);
}

function gizliKapiRaf(b, v) {
  const sl = M.slide(0b11);
  b.setAnim(2.9, 0, 0);
  b.box(-1.5, 0.0, -0.25, 1.5, 3.0, 0.2, C.woodDeep, sl);
  b.box(-1.5, 0.0, -0.25, -1.44, 3.0, 0.25, C.wood, sl);
  b.box(1.44, 0.0, -0.25, 1.5, 3.0, 0.25, C.wood, sl);
  b.box(-1.5, 2.94, -0.25, 1.5, 3.0, 0.25, C.wood, sl);
  const cols = [0xc0504a, 0x3b7bff, 0xf0b24c, 0x3d8b78, 0x8a5cff, 0xe9dfcf, 0xff6a9a, 0x4aa8c0];
  for (let i = 0; i < 5; i++) {
    const y = 0.1 + i * 0.56;
    b.box(-1.44, y, -0.25, 1.44, y + 0.04, 0.25, C.wood, sl);
    let x = -1.4;
    let k = 0;
    while (x < 1.36) {
      const w = 0.09 + ((i * 3 + k * 5 + v) % 4) * 0.02;
      const h = 0.3 + ((k + i * 2) % 4) * 0.05;
      b.box(x, y + 0.04, -0.2, Math.min(1.4, x + w), y + 0.04 + h, 0.18, cols[(k * 3 + i + v) % 8], sl, SKIP.NY | SKIP.NZ | SKIP.NX | SKIP.PX);
      x += w + 0.004;
      k++;
    }
  }
  // gizli kol: ipucu — tek kitap biraz çıkık, hafif parlak sırt
  b.box(0.4, 1.17, 0.18, 0.46, 1.43, 0.22, C.yellow, M.slideNeon(0b11, 0.25));
  b.setAnim(0, 0, 0);
}

function padPlate(b, depth) {
  b.box(-0.1875, 0.0, -depth, 0.1875, 0.5, 0.0, C.steelDark, M.body);
  b.box(-0.17, 0.02, 0.0, 0.17, 0.48, 0.01, C.steelMid, M.body);
}

function statusLed(b, x, y, z) {
  b.box(x - 0.025, y, z, x + 0.025, y + 0.03, z + 0.004, C.orange, M.neonP(0b001, 1, 0));
  b.box(x - 0.025, y, z, x + 0.025, y + 0.03, z + 0.004, C.green, M.neonP(0b010, 1, 0));
  b.box(x - 0.025, y, z, x + 0.025, y + 0.03, z + 0.004, C.red, M.neonP(0b100, 1, 0));
}

function kodPaneli(b) {
  padPlate(b, 0.0625);
  b.box(-0.14, 0.38, 0.0105, 0.14, 0.45, 0.014, C.black, M.body);
  bar(b, -0.12, 0.405, 0.0145, 0.12, 0.425, 0.017, C.orange, M.neonP(0b001, 0.8, 0.1));
  bar(b, -0.12, 0.405, 0.0145, 0.12, 0.425, 0.017, C.green, M.neonP(0b010, 0.8, 0));
  bar(b, -0.12, 0.405, 0.0145, 0.12, 0.425, 0.017, C.red, M.neonP(0b100, 0.8, 0));
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 2; k++) {
      const x = -0.075 + k * 0.15;
      const y = 0.06 + r * 0.1;
      b.box(x - 0.055, y, 0.0105, x + 0.055, y + 0.075, 0.03, C.steelLight, M.body);
      // 1..6 zar noktaları (küçük)
      const n = r * 2 + k + 1;
      const pts = [[0, 0], [-1, -1, 1, 1], [-1, -1, 0, 0, 1, 1], [-1, -1, 1, -1, -1, 1, 1, 1], [-1, -1, 1, -1, 0, 0, -1, 1, 1, 1], [-1, -1, 1, -1, -1, 0, 1, 0, -1, 1, 1, 1]][n - 1];
      const flat = n === 1 ? [0, 0] : pts;
      for (let q = 0; q + 1 < flat.length; q += 2) {
        b.box(x + flat[q] * 0.022 - 0.008, y + 0.0375 + flat[q + 1] * 0.02 - 0.008, 0.0301, x + flat[q] * 0.022 + 0.008, y + 0.0375 + flat[q + 1] * 0.02 + 0.008, 0.0325, C.black, M.body);
      }
    }
  }
  statusLed(b, 0.12, 0.47, 0.0105);
}

function kartOkuyucu(b, v) {
  const tier = [C.steelLight, C.orange, C.purple][v % 3];
  padPlate(b, 0.0625);
  b.box(-0.13, 0.28, 0.0105, 0.13, 0.4, 0.03, C.black, M.body);
  b.box(-0.1, 0.325, 0.03, 0.1, 0.34, 0.032, C.panel, M.body);
  bar(b, -0.1, 0.345, 0.03, 0.1, 0.355, 0.0325, C.orange, M.neonP(0b001, 0.8, 0.2));
  bar(b, -0.1, 0.345, 0.03, 0.1, 0.355, 0.0325, C.green, M.neonP(0b010, 0.9, 0));
  bar(b, -0.1, 0.345, 0.03, 0.1, 0.355, 0.0325, C.red, M.neonP(0b100, 0.9, 0));
  // kart simgesi: kademe rengi
  b.box(-0.07, 0.08, 0.0105, 0.07, 0.2, 0.014, C.black, M.body);
  b.box(-0.055, 0.1, 0.014, 0.055, 0.18, 0.0165, tier, M.neon(0.7));
  b.box(-0.04, 0.14, 0.0166, 0.01, 0.16, 0.0172, C.black, M.body);
  statusLed(b, 0.12, 0.46, 0.0105);
  bar(b, -0.17, 0.46, 0.0105, -0.12, 0.47, 0.0125, tier, M.neon(0.9));
}

function hackTerminali(b) {
  b.box(-0.25, 0.0, -0.125, 0.25, 0.75, 0.0, C.steelDark, M.body);
  b.extrude(-0.23, 0.23, [[0.1, 0.08], [0.1, 0.36], [0.0, 0.72], [-0.1, 0.72], [-0.125, 0.08]], C.steelMid, M.body);
  b.quad([-0.2, 0.4, 0.002], [0.2, 0.4, 0.002], [0.2, 0.7, 0.002], [-0.2, 0.7, 0.002], [0, 0, 1], C.panel, M.body);
  face(b, -0.19, 0.42, 0.19, 0.68, 0.0035, 1, C.green, M.screen(0b011, 0.95));
  [[-0.14, C.red], [0, C.yellow], [0.14, C.cyan]].forEach((q) => b.box(q[0] - 0.045, 0.08, 0.085, q[0] + 0.045, 0.12, 0.105, q[1], M.neon(0.8)));
  statusLed(b, 0.19, 0.03, 0.1);
  bar(b, -0.23, 0.03, 0.098, 0.15, 0.04, 0.102, C.green, M.neon(0.5));
}

function asansorDugmesi(b) {
  b.box(-0.1875, 0.0, -0.0625, 0.1875, 0.625, 0.0, C.steelDark, M.body);
  b.box(-0.16, 0.03, 0.0, 0.16, 0.6, 0.012, C.steelLight, M.body);
  // yukarı / aşağı çağrı düğmeleri: siyah taban + üçgen ok (üç kademeli çubuk)
  [[0.43, 1], [0.17, -1]].forEach((q) => {
    const cy = q[0];
    const s = q[1];
    b.box(-0.095, cy - 0.095, 0.012, 0.095, cy + 0.095, 0.03, C.black, M.body);
    b.box(-0.05, cy - 0.045 * s - 0.01, 0.03, 0.05, cy - 0.045 * s + 0.01, 0.034, C.white, M.neonP(0b01, 0.55, 1));
    b.box(-0.032, cy - 0.01, 0.03, 0.032, cy + 0.01, 0.034, C.white, M.neonP(0b01, 0.55, 1));
    b.box(-0.014, cy + 0.045 * s - 0.01, 0.03, 0.014, cy + 0.045 * s + 0.01, 0.034, C.white, M.neonP(0b01, 0.55, 1));
    b.box(-0.05, cy - 0.045 * s - 0.01, 0.03, 0.05, cy + 0.045 * s + 0.01, 0.0305, C.green, M.neonP(0b10, 1, 0));
  });
  bar(b, -0.1, 0.595, 0.012, 0.1, 0.612, 0.016, C.green, M.neonP(0b10, 1, 0.1));
}

function postaKutusu(b, v) {
  const c = [C.steelMid, C.orange, C.blue][v % 3];
  b.box(-0.25, 0.0, -0.125, 0.25, 0.75, 0.0, C.steelDark, M.body);
  chamfBox(b, -0.23, 0.05, 0.0, 0.23, 0.7, 0.12, c, M.body, 0.03);
  b.box(-0.15, 0.4, 0.121, 0.15, 0.44, 0.123, C.black, M.body);
  b.box(-0.12, 0.2, 0.121, 0.12, 0.32, 0.123, C.panel, M.body);
  bar(b, -0.1, 0.24, 0.123, 0.1, 0.26, 0.125, C.cyan, M.neon(0.5));
  b.box(0.1, 0.55, 0.0, 0.14, 0.62, 0.2, C.red, M.body);
  b.box(0.1, 0.62, 0.0, 0.2, 0.66, 0.06, C.red, M.body);
}

function kodNotu(b, v, h, x) {
  void h;
  const paper = [C.paper, C.yellow, C.mint][v % 3];
  b.box(-0.25, 0.0, -0.0625, 0.25, 0.5, 0.0, paper, M.body);
  b.box(-0.25, 0.0, 0.0, 0.25, 0.5, 0.004, paper, M.body, SKIP.NZ);
  // bant + kıvrık köşe
  b.box(-0.07, 0.45, 0.0, 0.07, 0.52, 0.007, C.steelLight, M.body);
  b.box(0.15, 0.0, 0.0, 0.25, 0.1, 0.007, 0xd9cfae, M.body);
  const d = x && x.digits;
  if (d && d.length) {
    const n = d.length;
    const s = Math.min(0.1, 0.4 / n - 0.01);
    for (let i = 0; i < n; i++) dicePips(b, -0.2 + s / 2 + 0.02 + i * (s + 0.01) + (0.4 - n * (s + 0.01)) / 2, 0.24, 0.0062, s, d[i], C.black);
  } else {
    for (let i = 0; i < 4; i++) b.box(-0.18, 0.12 + i * 0.08, 0.0045, 0.18 - (i % 2) * 0.08, 0.14 + i * 0.08, 0.0065, C.steelMid, M.body);
  }
}

export const DOOR_BUILDERS = Object.freeze({
  kapi,
  kapi_genis: kapiGenis,
  gizli_kapi_raf: gizliKapiRaf,
  kod_paneli: kodPaneli,
  kart_okuyucu: kartOkuyucu,
  hack_terminali: hackTerminali,
  asansor_dugmesi: asansorDugmesi,
  posta_kutusu: postaKutusu,
  kod_notu: kodNotu,
});
