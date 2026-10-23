/*
 * KEŞİF sim/city/vehicle — ARAÇ DÜŞEY HAREKETİ (saf; belirlenimci): 4 tekerlek zemin düzlemi, basamak/rampa takibi (1 blokluk basamak hızla rampa gibi çıkılır),
 * hover yayı, havada uçuş + iniş, su (yüzer; 3 sn sonra yola ışınlama için vehiclePhysics'e geri çağrı), görsel eğim (zemin düzlemi + ağırlık aktarımı + yaslanma).
 *
 *   stepOf(d, u, assist?) → o an geçerli basamak payı (yavaşken normal; |u| ≥ 4 ya da basamak yardımı varken hızlı; hover her zaman hızlı)
 *   climbAssist(v, inp) → bool   gaz/fren basılı ama araç ≥ 0,3 sn kıpırdamıyor (gömülü değil): basamak yardımı
 *   groundPlane(x,y,z,yaw,d,world,yTop,depth,liquid) → GP {gc (merkez yüksekliği), pitch, roll, count, unknown, maxG, minG}   (modül tamponu)
 *   liquidDepth(world,x,z,y) → araç alt yüzünden yukarı bitişik sıvı derinliği (üst sınır 4)
 *   verticalStep(v, d, world, h, inp, respawn)    alt adım sonu çağrılır
 */
import { BLOCKS } from '../../blocks.js';
import { groundHeight, gtopCap } from './vehicleWorld.js';

export const GRAVITY = 24;
export const TERMINAL = 55;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export const GP = {
  gc: 0, pitch: 0, roll: 0, count: 0, unknown: false, maxG: -Infinity, minG: Infinity,
};
const _g = [0, 0, 0, 0];

export function stepOf(d, u, assist) {
  return d.hover > 0 || assist || Math.abs(u) >= 4 ? d.step[1] : d.step[0];
}

/**
 * Basamak yardımı (qa_p3 QA3-004): tünel/yarma rampaları 1 blokluk basamaklardan oluşur ve basamağın dibinde duran araç (yavaşken basamak payı 0,6) gazla kıpırdamıyor,
 * 6 sn sonra otomatik kurtarmayı bekliyordu. Sürücü gaza/frene ≥ 0,3 sn bastığı halde araç kıpırdamıyorsa (stuckT) ve gövde katıya gömülü değilse (wedgeT = 0)
 * hızlı basamak payı (1,05) rampa gibi uygulanır; yardım 0,8 sn kilitli kalır (climbT: temas titreşimi yardımı açıp kapatmasın). Gömülü araç yine kurtarma yoluna gider.
 */
export function climbAssist(v, inp) {
  if (!inp || !(inp.throttle > 0.3 || inp.brake > 0.3) || v.wedgeT > 0) return false;
  return v.stuckT > 0.3 || v.climbT > 0;
}

export function groundPlane(x, y, z, yaw, d, world, yTop, depth, liquid) {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const fx = -sy;
  const fz = -cy;
  const rx = cy;
  const rz = -sy;
  const a = d.hover > 0 ? d.length * 0.38 : d.wheelbase * 0.5;
  const tw = (d.track > 0 ? d.track : d.width * 0.7) * 0.5;
  _g[0] = groundHeight(world, x + fx * a - rx * tw, z + fz * a - rz * tw, yTop, depth, liquid); // ön sol
  _g[1] = groundHeight(world, x + fx * a + rx * tw, z + fz * a + rz * tw, yTop, depth, liquid); // ön sağ
  _g[2] = groundHeight(world, x - fx * a - rx * tw, z - fz * a - rz * tw, yTop, depth, liquid); // arka sol
  _g[3] = groundHeight(world, x - fx * a + rx * tw, z - fz * a + rz * tw, yTop, depth, liquid); // arka sağ
  let cnt = 0;
  let sum = 0;
  let unk = false;
  let mx = -Infinity;
  let mn = Infinity;
  for (let i = 0; i < 4; i++) {
    const g = _g[i];
    if (g !== g) {
      unk = true;
      continue;
    }
    if (g === -Infinity) continue;
    cnt++;
    sum += g;
    if (g > mx) mx = g;
    if (g < mn) mn = g;
  }
  GP.count = cnt;
  GP.unknown = unk;
  GP.maxG = mx;
  GP.minG = mn;
  GP.gc = cnt > 0 ? sum / cnt : -Infinity;
  const ok0 = _g[0] > -Infinity;
  const ok1 = _g[1] > -Infinity;
  const ok2 = _g[2] > -Infinity;
  const ok3 = _g[3] > -Infinity;
  let pitch = 0;
  let roll = 0;
  if ((ok0 || ok1) && (ok2 || ok3)) {
    const fAvg = ok0 && ok1 ? (_g[0] + _g[1]) * 0.5 : ok0 ? _g[0] : _g[1];
    const rAvg = ok2 && ok3 ? (_g[2] + _g[3]) * 0.5 : ok2 ? _g[2] : _g[3];
    pitch = Math.atan2(fAvg - rAvg, 2 * a);
  }
  if ((ok0 && ok1) || (ok2 && ok3)) {
    const l = ok0 && ok2 ? (_g[0] + _g[2]) * 0.5 : ok0 ? _g[0] : _g[2];
    const r = ok1 && ok3 ? (_g[1] + _g[3]) * 0.5 : ok1 ? _g[1] : _g[3];
    roll = Math.atan2(l - r, 2 * tw);
  }
  GP.pitch = clamp(pitch, -0.6, 0.6);
  GP.roll = clamp(roll, -0.45, 0.45);
  return GP;
}

export function liquidDepth(world, x, z, y) {
  const cx = Math.floor(x);
  const cz = Math.floor(z);
  let cy = Math.floor(y + 0.2);
  let depth = 0;
  for (let n = 0; n < 4; n++, cy++) {
    const id = world.getBlock(cx, cy, cz);
    if (id === null || id === undefined || id === 0) break;
    const b = BLOCKS[id];
    if (!b || !b.liquid) break;
    depth += n === 0 ? cy + 1 - y : 1;
  }
  return depth;
}

function ease(v, h) {
  v.pitch += (0 - v.pitch) * Math.min(1, 6 * h);
  v.roll += (0 - v.roll) * Math.min(1, 6 * h);
}

export function verticalStep(v, d, world, h, inp, respawn) {
  const ev = v.events;
  const hover = d.hover > 0;
  const sa = stepOf(d, v.u, climbAssist(v, inp));
  const ua = Math.abs(v.u);
  const stick = hover ? d.hover + 0.6 : sa + 0.12;
  // basamak payı, en yüksek tekerlek temasından (önceki adımın gTop'u) sayılır: gövde eğimliyken ön tekerlekler üstteki basamağa çıkabilir
  const base = !hover && v.gTop > v.y ? (v.gTop < v.y + gtopCap(d) ? v.gTop : v.y + gtopCap(d)) : v.y; // QA5-A2: sınırlı (katı kütle içindeki tekerlek her karede bir basamak tırmanıp aracı duvardan yukarı ışınlamasın)
  const yTop = base + sa;
  const depth = hover ? 4.2 + sa : stick + sa + 0.35 + (base - v.y);
  const gp = groundPlane(v.x, v.y, v.z, v.yaw, d, world, yTop, depth, hover);
  v.gTop = gp.count > 0 && gp.maxG > v.y ? gp.maxG : v.y;

  /* ---- su (yalnız tekerlekliler) ---- */
  if (!hover) {
    const ld = liquidDepth(world, v.x, v.z, v.y);
    const was = v.inWater;
    const inW = ld > 0.9 || (was && ld > 0.3);
    v.inWater = inW;
    if (inW) {
      if (!was) ev.push({ type: 'splash', x: v.x, y: v.y, z: v.z });
      v.waterT += h;
      if (v.waterT > 3) {
        ev.push({ type: 'waterRespawn' });
        v.waterT = 0;
        v.inWater = false;
        respawn(v);
        return;
      }
      if (gp.count < 2 && !gp.unknown) {
        // derin su: yüzer (dibe batmaz), hız sınırı ana adımda uygulanır
        v.y += (v.y + ld - 0.7 - v.y) * Math.min(1, 3 * h);
        v.vy = 0;
        v.onGround = false;
        v.airT = 0;
        ease(v, h);
        return;
      }
    } else if (v.waterT > 0) v.waterT = Math.max(0, v.waterT - h);
  }

  if (gp.unknown) {
    // altımızdaki veri henüz yüklenmedi: yerinde dur (düşme yok)
    v.vy = 0;
    return;
  }

  let pitchT = 0;
  let rollT = 0;
  if (hover) {
    const hh = gp.count >= 1 ? v.y - gp.gc : Infinity;
    if (v.hopT > 0) v.hopT = v.hopT > h ? v.hopT - h : 0;
    if (inp.hop && !v.hopPrev && d.kind === 'tahta') {
      if (hh < 0.7) {
        v.vy = 8;
        v.hopT = 0.6;
        v.hopsLeft = 1;
        ev.push({ type: 'hop' });
      } else if (v.hopsLeft > 0 && v.nitro > 10) {
        v.hopsLeft--;
        v.nitro -= 8;
        v.vy = 8;
        v.hopT = 0.6;
        ev.push({ type: 'hop' });
      }
    }
    v.hopPrev = inp.hop === true;
    const ballistic = v.hopT > 0 && !(v.vy < 0 && hh <= d.hover + 0.4);
    const near = hh < d.hover + 3;
    if (near && !ballistic) {
      const a = 60 * (d.hover - hh) - 15.5 * v.vy;
      v.vy += a * h;
    } else v.vy -= GRAVITY * h;
    v.vy = clamp(v.vy, -TERMINAL, 20);
    v.y += v.vy * h;
    if (gp.count >= 1 && v.y < gp.gc + 0.05) {
      v.y = gp.gc + 0.05;
      if (v.vy < 0) v.vy = 0;
    }
    v.onGround = near && hh < d.hover + 0.9 && !ballistic;
    if (v.onGround) {
      v.airT = 0;
      if (v.airSpin > 2.4) ev.push({ type: 'style', spins: Math.max(1, Math.floor(v.airSpin / 6.28)) });
      v.airSpin = 0;
      v.hopsLeft = 1;
      pitchT = gp.pitch;
      rollT = gp.roll;
      v.fallT = 0;
    } else {
      v.airT += h;
      v.airSpin += Math.abs(v.yawRate + v.spin) * h;
      pitchT = clamp(Math.atan2(v.vy, Math.max(4, ua)) * 0.5, -0.4, 0.4);
      v.fallT = gp.count >= 1 ? 0 : v.fallT + h;
    }
  } else {
    const sup = gp.count >= 2 || (d.kind === 'motor' && gp.count >= 1);
    if (v.onGround) {
      if (sup && v.y - gp.gc <= stick) {
        const dy = gp.gc - v.y;
        let ny = v.y;
        if (dy > 0) {
          const rise = (7 + 0.3 * ua) * h;
          ny = dy > 1.6 || rise >= dy ? gp.gc : v.y + rise;
        } else if (dy < 0) {
          const fall = 14 * h;
          ny = -dy <= fall ? gp.gc : v.y - fall;
        }
        v.vyGround += ((ny - v.y) / h - v.vyGround) * Math.min(1, 12 * h);
        v.y = ny;
        v.vy = 0;
        v.airT = 0;
        v.fallT = 0;
        pitchT = gp.pitch;
        rollT = gp.roll;
      } else {
        // zemin kesildi: rampa sıçraması (çıkış hızı = son zemin tırmanma hızı, sınırlı)
        v.onGround = false;
        v.vy = clamp(v.vyGround, -2, Math.min(12, 0.45 * ua + 2));
        v.airT = 0;
        v.airSpin = 0;
        flight(v, h, gp, ev);
        pitchT = clamp(Math.atan2(v.vy, Math.max(4, ua)) * 0.6, -0.5, 0.5);
      }
    } else {
      flight(v, h, gp, ev);
      if (v.onGround) {
        pitchT = gp.pitch;
        rollT = gp.roll;
      } else pitchT = clamp(Math.atan2(v.vy, Math.max(4, ua)) * 0.6, -0.5, 0.5);
    }
  }

  /* ---- görsel eğim: zemin düzlemi + ağırlık aktarımı + yaslanma ---- */
  const lean = d.kind === 'motor' ? 0.5 : d.kind === 'hover' ? 0.3 : d.kind === 'tahta' ? 0.38 : 0;
  const latR = -v.yawRate * v.u; // sağa doğru yanal ivme (+ sağ dönüş)
  if (lean > 0) rollT += clamp(latR * 0.012, -lean, lean);
  else rollT += clamp(-latR * 0.0035, -0.16, 0.16);
  pitchT += clamp(v.aLong * 0.005, -0.1, 0.1);
  const k = 1 - Math.exp(-10 * h);
  v.pitch += (pitchT - v.pitch) * k;
  v.roll += (rollT - v.roll) * k;
}

/** Havada: yerçekimi + iniş denetimi (zemin düzlemi gc'ye ulaşınca). */
function flight(v, h, gp, ev) {
  v.vy -= GRAVITY * h;
  if (v.vy < -TERMINAL) v.vy = -TERMINAL;
  v.airT += h;
  v.fallT += gp.count < 2 ? h : 0;
  v.airSpin += Math.abs(v.yawRate + v.spin) * h;
  const ny = v.y + v.vy * h;
  const sup = gp.count >= 2 || (v.def.kind === 'motor' && gp.count >= 1);
  if (sup && v.vy <= 0.5 && ny <= gp.gc) {
    const impact = v.vy < 0 ? -v.vy : 0;
    v.y = gp.gc;
    v.vy = 0;
    v.onGround = true;
    v.airT = 0;
    v.fallT = 0;
    v.vyGround = 0;
    if (impact > 5) {
      ev.push({
        type: 'land', impact, x: v.x, y: gp.gc, z: v.z,
      });
      if (impact > 9 && v.bumpCool <= 0) {
        v.bumpCool = 0.3;
        v.bumpT = 0.3;
        v.hazardT = 3;
        v.dmg = Math.min(1, v.dmg + impact * 0.012);
        v.vx *= 0.85;
        v.vz *= 0.85;
        v.u *= 0.85;
        ev.push({
          type: 'bump', impact, nx: 0, nz: 0, x: v.x, y: v.y, z: v.z, soft: false, id: 0,
        });
      }
    }
    if (v.airSpin > 2.4) ev.push({ type: 'style', spins: Math.max(1, Math.floor(v.airSpin / 6.28)) });
    v.airSpin = 0;
  } else v.y = ny;
}
