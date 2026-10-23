/*
 * KEŞİF sim/city/vehicle — TRAFİK ARAÇ TAKİBİ (Neon Meridyen Faz 3, paket traffic_ai). SAF, tahsissiz sıcak yol, es2020.
 * IDM (akıllı sürücü modeli) + engel (oyuncu aracı / park araç / oyuncu / ileride yaya) koridoru + gün saatine göre yoğunluk.
 *
 *   idmAcc(v, v0, gap, vLead, aMax, bComf, T, s0) → ivme (m/s²)        a = aMax[1 − (v/v0)^4 − (s* / gap)²]
 *   B_MAX                                                               en sert fren (m/s²)
 *   obstacleAcc(c, obstacles, n, v0) → ivme | +Infinity (engel yok)    c: {x,z,yaw,v,halfLen,halfWid,aMax,bComf,T,s0}
 *        engel {x,z,yaw,hl,hw,vx,vz,kind}: koridor = aracın önündeki, yanal kesişimi olan engeller
 *   densityMul(phase) → 0..1+   (şafak 0,6 · öğle 0,8 · gün batımı 1,0 · gece 0,45 · gece yarısı 0,3; doğrusal)
 */
export const B_MAX = 9;

export function idmAcc(v, v0, gap, vLead, aMax, bComf, T, s0) {
  const g = gap < 0.05 ? 0.05 : gap;
  const dv = v - vLead;
  let sStar = s0 + v * T + (v * dv) / (2 * Math.sqrt(aMax * bComf));
  if (sStar < s0) sStar = s0;
  const r = v0 > 0.1 ? v / v0 : 1;
  const r2 = r * r;
  const q = sStar / g;
  return aMax * (1 - r2 * r2 - q * q);
}

/**
 * Engeller aracın önündeki koridorda mı? Araç çerçevesine dönüştürülür (yön = yaw; ileri (−sin, −cos)).
 * Dönüş: en küçük IDM ivmesi; engel yoksa +Infinity. out.blocked = engel var; out.gap = en yakın boşluk.
 */
const _o = {
  blocked: false, gap: 1e9, kind: 0, slow: false,
};
/** Park/duran araç şeridin hemen yanındaysa (yanal boşluk < 1,4 m ek pay) geçerken yavaşlanır (sürücü sağduyusu). */
export const PASS_SLOW_SPEED = 6;
export function obstacleAcc(c, obs, n, v0) {
  _o.blocked = false;
  _o.gap = 1e9;
  _o.slow = false;
  const sy = Math.sin(c.yaw);
  const cy = Math.cos(c.yaw);
  const fx = -sy;
  const fz = -cy;
  const rx = cy;
  const rz = -sy;
  const look = 38 + c.v * 1.6;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const o = obs[i];
    if (o.y !== undefined && Math.abs(o.y - c.y) > 3.5) continue; // başka kat (çatı/köprü altı/tünel üstü)
    const dx = o.x - c.x;
    const dz = o.z - c.z;
    const fwd = dx * fx + dz * fz;
    if (fwd < -6 || fwd > look + 8) continue;
    const lat = dx * rx + dz * rz;
    if (lat > 9 || lat < -9) continue;
    const ca = Math.abs(Math.cos(o.yaw - c.yaw));
    const sa = Math.abs(Math.sin(o.yaw - c.yaw));
    const eF = o.hl * ca + o.hw * sa;
    const eL = o.hw * ca + o.hl * sa;
    const margin = 0.32 + 0.28 * (c.v > 10 ? 1 : c.v / 10);
    if (Math.abs(lat) >= eL + c.halfWid + margin) {
      if (Math.abs(lat) < eL + c.halfWid + margin + 1.4 && fwd > -3 && fwd < 22 && Math.abs(o.vx) + Math.abs(o.vz) < 1) _o.slow = true;
      continue;
    }
    const gap = fwd - eF - c.halfLen;
    if (gap > look) continue;
    if (fwd < 0 && gap < -c.len) continue; // yanında/arkasında kalmış
    _o.blocked = true;
    if (gap < _o.gap) {
      _o.gap = gap;
      _o.kind = o.kind;
    }
    let vl = o.vx * fx + o.vz * fz;
    if (vl < 0) vl = 0;
    const a = gap <= 0 ? -B_MAX : idmAcc(c.v, v0, gap, vl, c.aMax, c.bComf, c.T, c.s0);
    if (a < best) best = a;
  }
  return best;
}

export function obstacleInfo() {
  return _o;
}

const DENSITY_KEYS = Object.freeze([[0, 0.6], [0.25, 0.8], [0.5, 1.0], [0.62, 0.45], [0.75, 0.3], [1.0, 0.6]]);

/** Gün fazı (motor ekseni 0 = gün doğumu, 0,75 = gece yarısı) → yoğunluk çarpanı. */
export function densityMul(phase) {
  let p = Number.isFinite(phase) ? phase % 1 : 0.25;
  if (p < 0) p += 1;
  for (let i = 1; i < DENSITY_KEYS.length; i++) {
    if (p <= DENSITY_KEYS[i][0]) {
      const a = DENSITY_KEYS[i - 1];
      const b = DENSITY_KEYS[i];
      return a[1] + ((b[1] - a[1]) * (p - a[0])) / (b[0] - a[0]);
    }
  }
  return 0.6;
}

/**
 * Oyuncu çarpması politikası (qa_p3, QA3-001): ARKADAN çarpılan araç durmaz (öndeki yoluna devam eder; oyuncunun hızı fizikte zaten yarıya iner), diğer çarpmalarda
 * 1,5 sn durur. Aynı araç 10 sn içinde 4. kez çarpılırsa (oyuncu sürekli yapışıyor) `vanish` = görünmeden/solarak silinip başka yerde yeniden doğar.
 * Eski davranış (her çarpmada 1,5 sn bekleme) gazı basılı oyuncuyu kavşak içinde yürüyen bir araca tekrar tekrar çarptırıp kutuyu dakikalarca tıkıyordu.
 *   hist: araç kimliği → {t, n} (çağıran tutar). Dönüş (paylaşılan nesne): {hold, behind, vanish}
 */
export const BUMP_REPEAT_WINDOW = 10;
export const BUMP_REPEAT_MAX = 4;
const _bp = { hold: 1.5, behind: false, vanish: false };
export function bumpPolicy(c, px, pz, hist, now) {
  _bp.hold = 1.5;
  _bp.behind = false;
  _bp.vanish = false;
  if (Number.isFinite(px) && Number.isFinite(pz)) {
    const fx = -Math.sin(c.yaw);
    const fz = -Math.cos(c.yaw);
    if ((px - c.x) * fx + (pz - c.z) * fz < -0.6 * c.halfLen) {
      _bp.behind = true;
      _bp.hold = 0;
    }
  }
  let h = hist.get(c.id);
  if (!h || now - h.t > BUMP_REPEAT_WINDOW || now < h.t) {
    h = { t: now, n: 0 };
    hist.set(c.id, h);
  }
  h.n++;
  if (h.n >= BUMP_REPEAT_MAX) {
    _bp.vanish = true;
    hist.delete(c.id);
  }
  if (hist.size > 64) hist.clear();
  return _bp;
}
