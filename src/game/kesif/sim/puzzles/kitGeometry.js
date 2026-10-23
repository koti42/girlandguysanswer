/*
 * KEŞİF bulmaca altyapısı — geometri yardımcıları (saf).
 *
 * YEREL ÇERÇEVE (bulmaca odası koordinatları):
 *   lx  sağ (+) / sol (−)    oda ekseninde ortalı; w genişlik için lx ∈ [−((w−1)>>1), +w−1−((w−1)>>1)]
 *   ly  yukarı               zemin hücresi (oyuncunun durduğu hava) ly=0; zemin BLOĞU ly=−1
 *   lz  derinlik             kapı duvarı lz=−2,−1; oda içi lz ∈ [0,d−1]; arka duvar lz=d,d+1
 * `origin` = (lx=0,ly=0,lz=0) hücresinin dünya konumu, yani kapının hemen arkasındaki zemin hücresi (ortada).
 * `facing` 0..3: yerel +lz (odanın içi) dünyada 0:+Z  1:−X  2:−Z  3:+X yönüne bakar; yerel +lx sırasıyla
 * +X, +Z, −X, −Z olur (ayna yok, saf dönme). Oyuncu kapıdan girerken yerel +lz yönünde yürür.
 */
import { B, RUNES } from '../blocks.js';
import { MAX_BLOCK_ID } from '../constants.js';
import { hash3 } from '../rng.js';

/** facing → {fx,fz: yerel +lz'nin dünya yönü; rx,rz: yerel +lx'in dünya yönü}. */
export const FACINGS = Object.freeze([
  Object.freeze({ fx: 0, fz: 1, rx: 1, rz: 0 }),
  Object.freeze({ fx: -1, fz: 0, rx: 0, rz: 1 }),
  Object.freeze({ fx: 0, fz: -1, rx: -1, rz: 0 }),
  Object.freeze({ fx: 1, fz: 0, rx: 0, rz: -1 }),
]);

/** Her türlü girdiyi 0..3'e indirger (NaN → 0, negatifler dönerek). */
export function normFacing(f) {
  const n = Math.floor(Number(f));
  if (!Number.isFinite(n)) return 0;
  return ((n % 4) + 4) % 4;
}

/** Yerel → dünya. `out` verilirse yeni nesne üretmez. */
export function localToWorld(origin, facing, lx, ly, lz, out) {
  const f = FACINGS[normFacing(facing)];
  const o = out || {};
  o.x = origin.x + lx * f.rx + lz * f.fx;
  o.y = origin.y + ly;
  o.z = origin.z + lx * f.rz + lz * f.fz;
  return o;
}

/** Dünya → yerel (localToWorld'ün tersi). */
export function worldToLocal(origin, facing, x, y, z, out) {
  const f = FACINGS[normFacing(facing)];
  const dx = x - origin.x;
  const dz = z - origin.z;
  const o = out || {};
  o.x = dx * f.rx + dz * f.rz;
  o.y = y - origin.y;
  o.z = dx * f.fx + dz * f.fz;
  return o;
}

/** Yerel yön (ldx: sağ, ldz: ileri) → dünya yönü {dx,dz}. */
export function localDir(facing, ldx, ldz) {
  const f = FACINGS[normFacing(facing)];
  return { dx: ldx * f.rx + ldz * f.fx, dz: ldx * f.rz + ldz * f.fz };
}

/** Dünya yönü → yerel yön {x: sağ, z: ileri}. */
export function worldDirToLocal(facing, dx, dz) {
  const f = FACINGS[normFacing(facing)];
  return { x: dx * f.rx + dz * f.rz, z: dx * f.fx + dz * f.fz };
}

/** Genişlik w için yerel x aralığı {x0,x1} (çift genişlikte fazla hücre sağda). */
export function localXRange(w) {
  const x0 = -((w - 1) >> 1);
  return { x0, x1: x0 + w - 1 };
}

/** Yerel kutu (ucu dahil) → dünya AABB {x0,y0,z0,x1,y1,z1} (min/max sıralı, uçlar dahil). */
export function localBoxToWorld(origin, facing, lx0, ly0, lz0, lx1, ly1, lz1) {
  const a = localToWorld(origin, facing, lx0, ly0, lz0);
  const b = localToWorld(origin, facing, lx1, ly1, lz1);
  return {
    x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), z1: Math.max(a.z, b.z),
  };
}

/**
 * Oda hacmi {w,d,h} için dünya sınırları. inner = oda içi; outer = inner + `margin` hücre her yöne (duvar/zemin/tavan).
 */
export function roomBounds(origin, facing, fp, margin) {
  const m = margin === undefined ? 2 : margin;
  const xr = localXRange(fp.w);
  return {
    inner: localBoxToWorld(origin, facing, xr.x0, 0, 0, xr.x1, fp.h - 1, fp.d - 1),
    outer: localBoxToWorld(origin, facing, xr.x0 - m, -m, -m, xr.x1 + m, fp.h - 1 + m, fp.d - 1 + m),
  };
}

/** Bulmaca blokları (sistem kimlikleri; blocks.js'ten). RUNES: [{id,color,symbol,hex}] 5 renk. */
export const PUZZLE_BLOCKS = Object.freeze({
  PLATE: B.PRESSURE_PLATE,
  PLATE_ON: B.PRESSURE_PLATE_ON,
  LEVER: B.LEVER,
  LEVER_ON: B.LEVER_ON,
  RUNES,
  LOGIC_GATE: B.LOGIC_GATE,
  RECEIVER: B.RECEIVER,
  RECEIVER_ON: B.RECEIVER_ON,
  MIRROR: B.MIRROR,
  BEAM_SOURCE: B.BEAM_SOURCE,
  PUSH_BLOCK: B.PUSH_BLOCK,
  MOVING_PLATFORM: B.MOVING_PLATFORM,
  LOCKED_DOOR: B.LOCKED_DOOR,
  REWARD_CHEST: B.REWARD_CHEST,
  PORTAL_BLUE: B.PORTAL_BLUE,
  PORTAL_ORANGE: B.PORTAL_ORANGE,
  PORTAL_FRAME: B.PORTAL_FRAME,
  ALTAR: B.ALTAR,
  BEDROCK: B.BEDROCK,
});

/** Nokta kutunun içinde mi (uçlar dahil)? */
export function boxContains(b, x, y, z) {
  return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1;
}

/** Noktanın kutuya Öklid uzaklığı (içerideyse 0). */
export function distToBox(b, x, y, z) {
  const dx = x < b.x0 ? b.x0 - x : (x > b.x1 ? x - b.x1 : 0);
  const dy = y < b.y0 ? b.y0 - y : (y > b.y1 ? y - b.y1 : 0);
  const dz = z < b.z0 ? b.z0 - z : (z > b.z1 ? z - b.z1 : 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function checkId(id) {
  if (!Number.isInteger(id) || id < 0 || id > MAX_BLOCK_ID) {
    throw new RangeError('geçersiz blok kimliği: ' + String(id));
  }
}

/**
 * Yerel çerçeve: bulmaca yazarı tüm yerleştirmeyi yerel koordinatlarla yapar, çevirme/dönme burada olur.
 * Yazmalar `ctx.setBlock`'a gider; `ctx.clip` ({x0,z0,x1,z1} dünya, uçlar dahil) varsa chunk dışı hücreler
 * hiç yazılmaz (yalnızca hız içindir; sonuç aynıdır). Dekor için rng değil `hash`/`chance` kullan (belirlenimli,
 * chunk kesitinden bağımsız).
 */
export function frame(ctx) {
  const origin = ctx.origin;
  const f = FACINGS[normFacing(ctx.facing)];
  const ox = origin.x;
  const oy = origin.y;
  const oz = origin.z;
  const clip = ctx.clip || null;
  const seed = (ctx.seed | 0);

  function wx(lx, lz) {
    return ox + lx * f.rx + lz * f.fx;
  }
  function wz(lx, lz) {
    return oz + lx * f.rz + lz * f.fz;
  }
  function outside(a, b, c, d2) {
    // (lx,lz) köşe çifti dünyada clip dışında mı (kutu tümüyle dışarıda → true)
    if (!clip) return false;
    const x0 = Math.min(wx(a, b), wx(c, d2));
    const x1 = Math.max(wx(a, b), wx(c, d2));
    const z0 = Math.min(wz(a, b), wz(c, d2));
    const z1 = Math.max(wz(a, b), wz(c, d2));
    return x1 < clip.x0 || x0 > clip.x1 || z1 < clip.z0 || z0 > clip.z1;
  }

  const F = {
    ctx,
    origin,
    facing: normFacing(ctx.facing),

    toWorld(lx, ly, lz, out) {
      return localToWorld(origin, ctx.facing, lx, ly, lz, out);
    },
    toLocal(x, y, z, out) {
      return worldToLocal(origin, ctx.facing, x, y, z, out);
    },
    /** Yerel yön → dünya yönü {dx,dz}. */
    dir(ldx, ldz) {
      return localDir(ctx.facing, ldx, ldz);
    },
    /** Yerel kutu → dünya AABB. */
    worldBox(lx0, ly0, lz0, lx1, ly1, lz1) {
      return localBoxToWorld(origin, ctx.facing, lx0, ly0, lz0, lx1, ly1, lz1);
    },

    /** Belirlenimli hash (uint32): konum + bulmaca tohumu. */
    hash(lx, ly, lz, salt) {
      return hash3(lx, ly, lz, seed + (salt | 0));
    },
    /** Belirlenimli olasılık: p ∈ [0,1]. */
    chance(lx, ly, lz, p, salt) {
      return hash3(lx, ly, lz, seed + (salt | 0)) / 4294967296 < p;
    },

    set(lx, ly, lz, id) {
      checkId(id);
      const x = wx(lx, lz);
      const z = wz(lx, lz);
      if (clip && (x < clip.x0 || x > clip.x1 || z < clip.z0 || z > clip.z1)) return false;
      ctx.setBlock(x, oy + ly, z, id);
      return true;
    },
    /** Dünyadaki blok (yüklü değilse null). Belirlenimli inşada KULLANMA; yalnızca çalışma anında. */
    get(lx, ly, lz) {
      return ctx.getBlock ? ctx.getBlock(wx(lx, lz), oy + ly, wz(lx, lz)) : null;
    },

    /** Yerel kutuyu (uçlar dahil, sıra önemsiz) id ile doldurur. Yazılan hücre sayısını döner. */
    fill(lx0, ly0, lz0, lx1, ly1, lz1, id) {
      checkId(id);
      const ax = Math.min(lx0, lx1);
      const bx = Math.max(lx0, lx1);
      const ay = Math.min(ly0, ly1);
      const by = Math.max(ly0, ly1);
      const az = Math.min(lz0, lz1);
      const bz = Math.max(lz0, lz1);
      if (outside(ax, az, bx, bz)) return 0;
      let n = 0;
      for (let lz = az; lz <= bz; lz++) {
        for (let lx = ax; lx <= bx; lx++) {
          const x = wx(lx, lz);
          const z = wz(lx, lz);
          if (clip && (x < clip.x0 || x > clip.x1 || z < clip.z0 || z > clip.z1)) continue;
          for (let ly = ay; ly <= by; ly++) {
            ctx.setBlock(x, oy + ly, z, id);
            n++;
          }
        }
      }
      return n;
    },
    /** Kutuyu havayla doldurur (oyma). */
    carve(lx0, ly0, lz0, lx1, ly1, lz1) {
      return F.fill(lx0, ly0, lz0, lx1, ly1, lz1, 0);
    },
    /** Yalnızca kutunun yüzeyini (kabuğunu) doldurur; top/bottom false ise o yüzler boş kalır. */
    hollow(lx0, ly0, lz0, lx1, ly1, lz1, id, opts) {
      checkId(id);
      const o = opts || {};
      const ax = Math.min(lx0, lx1);
      const bx = Math.max(lx0, lx1);
      const ay = Math.min(ly0, ly1);
      const by = Math.max(ly0, ly1);
      const az = Math.min(lz0, lz1);
      const bz = Math.max(lz0, lz1);
      let n = 0;
      for (let ly = ay; ly <= by; ly++) {
        if (ly === ay && o.bottom === false) continue;
        if (ly === by && o.top === false) continue;
        for (let lz = az; lz <= bz; lz++) {
          for (let lx = ax; lx <= bx; lx++) {
            const edge = lx === ax || lx === bx || lz === az || lz === bz || ly === ay || ly === by;
            if (edge && F.set(lx, ly, lz, id)) n++;
          }
        }
      }
      return n;
    },
    /** Kutuyu hücre başına fn(lx,ly,lz) → id ile boyar; fn null/undefined/−1 dönerse hücre atlanır. */
    paint(lx0, ly0, lz0, lx1, ly1, lz1, fn) {
      const ax = Math.min(lx0, lx1);
      const bx = Math.max(lx0, lx1);
      const ay = Math.min(ly0, ly1);
      const by = Math.max(ly0, ly1);
      const az = Math.min(lz0, lz1);
      const bz = Math.max(lz0, lz1);
      if (outside(ax, az, bx, bz)) return 0;
      let n = 0;
      for (let lz = az; lz <= bz; lz++) {
        for (let lx = ax; lx <= bx; lx++) {
          const x = wx(lx, lz);
          const z = wz(lx, lz);
          if (clip && (x < clip.x0 || x > clip.x1 || z < clip.z0 || z > clip.z1)) continue;
          for (let ly = ay; ly <= by; ly++) {
            const id = fn(lx, ly, lz);
            if (id === null || id === undefined || id < 0) continue;
            checkId(id);
            ctx.setBlock(x, oy + ly, z, id);
            n++;
          }
        }
      }
      return n;
    },
    /** 3B tam sayı doğrusu (uçlar dahil). */
    line(lx0, ly0, lz0, lx1, ly1, lz1, id) {
      checkId(id);
      const dx = lx1 - lx0;
      const dy = ly1 - ly0;
      const dz = lz1 - lz0;
      const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
      let n = 0;
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        if (F.set(Math.round(lx0 + dx * t), Math.round(ly0 + dy * t), Math.round(lz0 + dz * t), id)) n++;
      }
      return n;
    },
    /** Daire çevresi (orta nokta algoritması). plane: 'xz' (yatay) | 'xy' | 'zy' (dikey). */
    ring(cx, cy, cz, r, id, plane) {
      checkId(id);
      const pl = plane || 'xz';
      const put = (u, v) => {
        if (pl === 'xz') F.set(cx + u, cy, cz + v, id);
        else if (pl === 'xy') F.set(cx + u, cy + v, cz, id);
        else F.set(cx, cy + v, cz + u, id);
      };
      let x = r;
      let y = 0;
      let err = 1 - r;
      while (x >= y) {
        put(x, y); put(y, x); put(-y, x); put(-x, y);
        put(-x, -y); put(-y, -x); put(y, -x); put(x, -y);
        y++;
        if (err < 0) {
          err += 2 * y + 1;
        } else {
          x--;
          err += 2 * (y - x) + 1;
        }
      }
    },
    /** Dolu daire (yatay 'xz' ya da dikey 'xy'|'zy'). */
    disc(cx, cy, cz, r, id, plane) {
      checkId(id);
      const pl = plane || 'xz';
      for (let v = -r; v <= r; v++) {
        for (let u = -r; u <= r; u++) {
          if (u * u + v * v > r * r + r) continue;
          if (pl === 'xz') F.set(cx + u, cy, cz + v, id);
          else if (pl === 'xy') F.set(cx + u, cy + v, cz, id);
          else F.set(cx, cy + v, cz + u, id);
        }
      }
    },
    /**
     * Kapı aralığı oyar. axis 'z' (varsayılan): duvar ±z yüzlü, açıklık x boyunca `width` hücre (lx merkez), `depth`
     * hücre lz'den +lz'ye geçer; axis 'x': duvar ±x yüzlü, açıklık z boyunca, +lx'e geçer.
     * fillId verilirse havayla değil o blokla doldurur. Yazılan yerel kutuyu döner.
     */
    doorway(o) {
      const width = o.width || 1;
      const height = o.height || 3;
      const depth = o.depth || 1;
      const ly = o.ly || 0;
      const id = o.fillId === undefined ? 0 : o.fillId;
      const half = (width - 1) >> 1;
      let box;
      if ((o.axis || 'z') === 'z') {
        box = [o.lx - half, ly, o.lz, o.lx - half + width - 1, ly + height - 1, o.lz + depth - 1];
      } else {
        box = [o.lx, ly, o.lz - half, o.lx + depth - 1, ly + height - 1, o.lz - half + width - 1];
      }
      F.fill(box[0], box[1], box[2], box[3], box[4], box[5], id);
      return { x0: box[0], y0: box[1], z0: box[2], x1: box[3], y1: box[4], z1: box[5] };
    },
    /** Baskı plakası koyar (on=true basılı görünüm). */
    plate(lx, ly, lz, on) {
      return F.set(lx, ly, lz, on ? B.PRESSURE_PLATE_ON : B.PRESSURE_PLATE);
    },
    /** Kol koyar (on=true açık). */
    lever(lx, ly, lz, on) {
      return F.set(lx, ly, lz, on ? B.LEVER_ON : B.LEVER);
    },
  };
  return F;
}
