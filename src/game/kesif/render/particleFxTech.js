/*
 * KEŞİF render — TEKNOLOJİ parçacık tarifleri (particleFx.js ile aynı sözleşme: sys.S taslağı + sys.emit).
 *
 *   techSmoke(p, strength)            jeneratör/ocak bacası: yükselen gri-beyaz buhar topakları (strength 0..1)
 *   techSpark(p, color, count)        kıvılcım serpintisi (ocak, şarj istasyonu, kısa devre)
 *   techDust(p, color, count)         madenci tozu: aşağı doğru dökülen toz + birkaç kırıntı ışıltısı
 *   jetFlame(p, vx, vy, vz)           jetpack egzozu: turuncu-mavi alev çekirdeği + duman (gövde hızı eklenir)
 *   teleportRing(p, color)            ışınlanma platformu: yükselen halkalar + ışık zerreleri (varış/çıkış)
 *   scanPulse(p, color)               tarama darbesi: oyuncunun etrafında genişleyen büyük yatay halka
 *   pingGlint(p, color)               bulunan hedef üzerinde kısa yıldız parıltısı
 *   shieldFlash(p)                    enerji kalkanı emilimi: mavi kıvılcım patlaması + dikey halka
 *   chargeBurst(p, color)             eşya şarjı: yukarı süzülen zerreler
 *   portalPuff(p, color)              portal açılışı/kapanışı: kısa ışıma patlaması
 *   gecisBurst(p, phase)              Keşif 'gecis' görünümü: sys.skin.gecis varken varış/çıkış halkaları + parıltı (yoksa hiçbir şey çıkarmaz)
 *
 * Keşif mağaza görünümü (sys.skin = {jet, gecis}; yoksa eski renkler BİREBİR): yalnız renk değişir; parçacık sayısı/sys.density/sys.reduced aynı.
 * jetFlame: flame[0..2] ve smoke; skin.spark ise (kısıtlı hareket ve low kademe [skin.anim=false] dışında) arada bir ek kıvılcım. Ek çizim çağrısı yok: aynı iki parçacık katmanı.
 *
 * Bütçe: hiçbir tarif 28 parçacığı aşmaz; yoğunluk sys.density ve kısıtlı hareket sys.reduced ile ölçeklenir.
 */
import { KIND } from './particleFx.js';
import { px, py, pz, scaleCount } from './particleLogic.js';

const TAU = Math.PI * 2;

export function createFxTech(sys) {
  const S = sys.S;
  const skin = () => sys.skin || null;
  const rnd = () => sys.rnd();
  const n = (count) => scaleCount(count, sys.density, rnd);
  const rv = (a, b) => a + rnd() * (b - a);
  const calm = () => (sys.reduced ? 0 : 1);
  function c0(hex, a, k = 1) {
    const c = sys.col(hex);
    S.r0 = c[0] * k; S.g0 = c[1] * k; S.b0 = c[2] * k; S.a0 = a;
  }
  function c1(hex, a, k = 1) {
    const c = sys.col(hex);
    S.r1 = c[0] * k; S.g1 = c[1] * k; S.b1 = c[2] * k; S.a1 = a;
  }
  function from(p) { S.x = px(p); S.y = py(p); S.z = pz(p); }

  function techSmoke(p, strength = 1) {
    const cnt = n(1 + 2 * Math.max(0, Math.min(1, strength)));
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SMOKE; from(p);
      S.x += rv(-0.14, 0.14); S.z += rv(-0.14, 0.14);
      S.vx = rv(-0.12, 0.12); S.vy = rv(0.55, 1.0); S.vz = rv(-0.12, 0.12);
      S.drag = 1.1; S.life = rv(1.0, 1.6); S.s0 = rv(0.09, 0.14); S.s1 = rv(0.34, 0.5);
      S.spin = rv(-0.8, 0.8) * calm(); S.turb = 0.05; S.tfreq = 2.4;
      c0(0xe6e8ec, 0.38, 1); c1(0x9aa0aa, 0, 1);
      sys.emit(S);
    }
  }

  function techSpark(p, color = 0xffd070, count = 5) {
    const cnt = n(count);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p);
      const a = rnd() * TAU;
      const sp = rv(1.2, 3.2);
      S.vx = Math.cos(a) * sp; S.vy = rv(1.0, 3.2); S.vz = Math.sin(a) * sp;
      S.grav = -9; S.drag = 0.5; S.life = rv(0.3, 0.6); S.s0 = rv(0.035, 0.06); S.s1 = 0.012;
      c0(color, 1, 1.35); c1(0xff6a10, 0, 1);
      sys.emit(S);
    }
  }

  function techDust(p, color = 0xb8b0a4, count = 4) {
    const cnt = n(count);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SMOKE; from(p);
      S.x += rv(-0.35, 0.35); S.z += rv(-0.35, 0.35);
      S.vx = rv(-0.5, 0.5); S.vy = rv(-1.4, -0.4); S.vz = rv(-0.5, 0.5);
      S.drag = 1.6; S.life = rv(0.5, 0.9); S.s0 = rv(0.07, 0.11); S.s1 = rv(0.2, 0.3);
      c0(color, 0.5, 1); c1(0x7a746c, 0, 1);
      sys.emit(S);
    }
    if (rnd() < 0.6) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      S.vx = rv(-0.6, 0.6); S.vy = rv(-1.8, -0.6); S.vz = rv(-0.6, 0.6);
      S.grav = -4; S.drag = 0.8; S.life = rv(0.4, 0.7); S.s0 = rv(0.03, 0.05); S.s1 = 0.01; S.tw = 8 * calm() + 0.01;
      c0(0xffe0a0, 1, 1.2); c1(0xffa040, 0, 1);
      sys.emit(S);
    }
  }

  function jetFlame(p, vx = 0, vy = 0, vz = 0) {
    const js = skin() && skin().jet ? skin().jet : null;
    const cnt = n(3);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.GLOW; from(p);
      S.x += rv(-0.1, 0.1); S.z += rv(-0.1, 0.1);
      S.vx = vx * 0.3 + rv(-0.35, 0.35); S.vy = Math.min(vy * 0.3, 0) - rv(3.2, 5.0); S.vz = vz * 0.3 + rv(-0.35, 0.35);
      S.drag = 1.2; S.life = rv(0.22, 0.4); S.s0 = rv(0.18, 0.26); S.s1 = 0.03;
      c0(js ? js.flame[i % 2 === 0 ? 0 : 1] : i % 2 === 0 ? 0x8fe0ff : 0xffb040, 0.9, 1.25); c1(js ? js.flame[2] : 0xff4a10, 0, 1);
      sys.emit(S);
    }
    if (rnd() < 0.55) {
      S.reset();
      S.kind = KIND.SMOKE; from(p);
      S.vx = vx * 0.2 + rv(-0.4, 0.4); S.vy = -rv(1.4, 2.4); S.vz = vz * 0.2 + rv(-0.4, 0.4);
      S.drag = 1.0; S.life = rv(0.6, 1.0); S.s0 = rv(0.1, 0.15); S.s1 = rv(0.34, 0.5);
      c0(js ? js.smoke : 0xcfd4dc, 0.3, 1); c1(js ? js.flame[2] : 0x6a707a, 0, 1);
      sys.emit(S);
    }
    if (js && js.spark && !sys.reduced && sys.skin.anim !== false && rnd() < 0.4) {
      // yıldız/kıvılcım izi: mevcut SPARK türü (≤1 ek parçacık/çağrı)
      S.reset();
      S.kind = KIND.SPARK; from(p);
      S.vx = vx * 0.2 + rv(-0.8, 0.8); S.vy = -rv(0.6, 1.8); S.vz = vz * 0.2 + rv(-0.8, 0.8);
      S.grav = -2; S.drag = 0.8; S.life = rv(0.4, 0.8); S.s0 = rv(0.04, 0.07); S.s1 = 0.012;
      c0(js.flame[0], 1, 1.4); c1(js.flame[2], 0, 1);
      sys.emit(S);
    }
  }

  function teleportRing(p, color = 0x7affea) {
    for (let i = 0; i < 3; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.mode = 0;
      S.y += i * 0.35;
      S.vy = 1.2; S.drag = 0.2; S.life = 0.75 + i * 0.08; S.s0 = 0.25; S.s1 = 0.95 - i * 0.12; S.delay = i * 0.08;
      c0(color, 0.85, 1.25); c1(color, 0, 1);
      sys.emit(S);
    }
    const cnt = n(12);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      const a = rnd() * TAU;
      const r = rv(0.1, 0.55);
      S.x += Math.cos(a) * r; S.z += Math.sin(a) * r;
      S.vx = 0; S.vy = rv(1.4, 3.4); S.vz = 0;
      S.drag = 0.6; S.life = rv(0.6, 1.2); S.s0 = rv(0.04, 0.08); S.s1 = 0.012; S.tw = 7 * calm() + 0.01;
      c0(color, 1, 1.3); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
  }

  function scanPulse(p, color = 0x5ad7ff) {
    S.reset();
    S.kind = KIND.RING; from(p); S.mode = 0; S.y += 0.15;
    S.life = 0.9; S.s0 = 0.4; S.s1 = 15; S.drag = 0;
    c0(color, sys.reduced ? 0.4 : 0.6, 1.2); c1(color, 0, 1);
    sys.emit(S);
    S.reset();
    S.kind = KIND.RING; from(p); S.mode = 0; S.y += 0.15; S.delay = 0.16;
    S.life = 0.9; S.s0 = 0.3; S.s1 = 10; S.drag = 0;
    c0(0xffffff, 0.35, 1); c1(color, 0, 1);
    sys.emit(S);
  }

  function pingGlint(p, color = 0xffffff) {
    S.reset();
    S.kind = KIND.STAR; from(p);
    S.life = 0.9; S.s0 = 0.35; S.s1 = 0.08; S.tw = 9 * calm() + 0.01;
    c0(color, 1, 1.3); c1(0xffffff, 0, 1);
    sys.emit(S);
  }

  function shieldFlash(p) {
    const cnt = n(14);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.SPARK; from(p);
      const a = rnd() * TAU;
      const sp = rv(2.0, 4.6);
      S.vx = Math.cos(a) * sp; S.vy = rv(-0.5, 3.0); S.vz = Math.sin(a) * sp;
      S.grav = -5; S.drag = 1.2; S.life = rv(0.25, 0.5); S.s0 = rv(0.04, 0.07); S.s1 = 0.012;
      c0(0x7ad8ff, 1, 1.4); c1(0x2a6aff, 0, 1);
      sys.emit(S);
    }
    S.reset();
    S.kind = KIND.RING; from(p); S.mode = 3;
    S.life = 0.35; S.s0 = 0.4; S.s1 = 1.3; S.drag = 0;
    c0(0x8ae0ff, 0.7, 1.3); c1(0x3a7aff, 0, 1);
    sys.emit(S);
  }

  function chargeBurst(p, color = 0x7affea) {
    const cnt = n(10);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = KIND.MOTE; from(p);
      const a = rnd() * TAU;
      const r = rv(0.2, 0.7);
      S.x += Math.cos(a) * r; S.z += Math.sin(a) * r; S.y += rv(-0.4, 0.6);
      S.vx = 0; S.vy = rv(0.8, 1.8); S.vz = 0; S.drag = 0.5;
      S.life = rv(0.6, 1.0); S.s0 = rv(0.04, 0.07); S.s1 = 0.012; S.tw = 8 * calm() + 0.01;
      c0(color, 1, 1.3); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
  }

  function portalPuff(p, color = 0x3a8fff) {
    const cnt = n(16);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = i % 3 === 0 ? KIND.GLOW : KIND.MOTE; from(p);
      const a = rnd() * TAU;
      const sp = rv(0.6, 2.2);
      S.vx = Math.cos(a) * sp * 0.6; S.vy = rv(-0.6, 1.6); S.vz = Math.sin(a) * sp * 0.6; S.drag = 1.3;
      S.life = rv(0.4, 0.8); S.s0 = rv(0.06, 0.14); S.s1 = 0.015; S.tw = 8 * calm() + 0.01;
      c0(color, 1, 1.3); c1(0xffffff, 0, 1);
      sys.emit(S);
    }
  }

  /**
   * 'gecis' görünümü: boyut geçişinde çıkış (phase 0) ve varış (1) halkaları + parıltı. Skin yoksa HİÇBİR şey çıkarmaz (varsayılan oyun
   * davranışı aynı kalır). Üst sınır ≤ 3 halka + 12 zerre = 15 parçacık (yoğunluk/kısıtlı hareket ölçekli).
   */
  function gecisBurst(p, phase = 1) {
    const gs = skin() && skin().gecis ? skin().gecis : null;
    if (!gs) return;
    const [a, b] = gs.ring;
    for (let i = 0; i < 3; i++) {
      S.reset();
      S.kind = KIND.RING; from(p); S.mode = 0;
      S.y += (phase ? 0.1 : 0.2) + i * 0.3;
      S.vy = phase ? -0.4 : 1.1; S.drag = 0.2; S.life = 0.7 + i * 0.08; S.s0 = phase ? 1.0 - i * 0.2 : 0.25; S.s1 = phase ? 0.3 : 0.95 - i * 0.1; S.delay = i * 0.07;
      c0(i % 2 === 0 ? a : b, 0.85, 1.25); c1(i % 2 === 0 ? b : a, 0, 1);
      sys.emit(S);
    }
    const cnt = n(gs.spark !== null ? 12 : 6);
    for (let i = 0; i < cnt; i++) {
      S.reset();
      S.kind = gs.spark !== null ? KIND.STAR : KIND.MOTE; from(p);
      const an = rnd() * TAU;
      const r = rv(0.15, 0.8);
      S.x += Math.cos(an) * r; S.z += Math.sin(an) * r; S.y += rv(0, 0.4);
      S.vx = 0; S.vy = gs.spark !== null ? -rv(0.2, 1.0) : rv(1.0, 2.6); S.vz = 0;
      S.drag = 0.6; S.life = rv(0.7, 1.3); S.s0 = rv(0.05, 0.1); S.s1 = 0.015; S.tw = (sys.skin.anim === false ? 0 : 6 * calm()) + 0.01;
      c0(gs.spark !== null ? gs.spark : (i % 2 ? a : b), 1, 1.3); c1(i % 2 ? b : a, 0, 1);
      sys.emit(S);
    }
  }

  return {
    techSmoke, techSpark, techDust, jetFlame, teleportRing, scanPulse, pingGlint, shieldFlash, chargeBurst, portalPuff, gecisBurst,
  };
}
