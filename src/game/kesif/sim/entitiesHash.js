/*
 * KEŞİF sim — varlıklar için tekdüze ızgara uzamsal karma (saf).
 * Her karede yeniden kurulur (clear → insert); dizi havuzu kullanır, kare başına ayırma yapmaz.
 * query(x, z, r, out, filter?) → out'a hücreleri kesen varlıkları ekler (r içindekiler; kesin mesafe testi yapılır).
 */
const CELL = 8;
const OFF = 4096;

export class SpatialHash {
  constructor(cell = CELL) {
    this.cell = cell;
    this.map = new Map();
    this.pool = [];
    this.used = [];
    this.count = 0;
  }

  clear() {
    for (let i = 0; i < this.used.length; i++) {
      const a = this.used[i];
      a.length = 0;
      this.pool.push(a);
    }
    this.used.length = 0;
    this.map.clear();
    this.count = 0;
  }

  _key(cx, cz) {
    return (cx + OFF) * 8192 + (cz + OFF);
  }

  insert(e) {
    const k = this._key(Math.floor(e.x / this.cell), Math.floor(e.z / this.cell));
    let a = this.map.get(k);
    if (a === undefined) {
      a = this.pool.length > 0 ? this.pool.pop() : [];
      this.map.set(k, a);
      this.used.push(a);
    }
    a.push(e);
    this.count++;
  }

  /** Daire içindeki varlıkları out'a ekler (mesafe ≤ r + varlık yarı genişliği). */
  query(x, z, r, out, filter) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const a = this.map.get(this._key(cx, cz));
        if (a === undefined) continue;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          const dx = e.x - x;
          const dz = e.z - z;
          const rr = r + (e.w || 0) * 0.5;
          if (dx * dx + dz * dz > rr * rr) continue;
          if (filter && !filter(e)) continue;
          out.push(e);
        }
      }
    }
    return out;
  }

  /** Yatay kutu [x0,x1]×[z0,z1] içindeki varlıklar (mermi/ışın ön eleme). */
  queryBox(x0, z0, x1, z1, out, filter) {
    const c = this.cell;
    const ax = Math.floor(x0 / c);
    const bx = Math.floor(x1 / c);
    const az = Math.floor(z0 / c);
    const bz = Math.floor(z1 / c);
    for (let cx = ax; cx <= bx; cx++) {
      for (let cz = az; cz <= bz; cz++) {
        const a = this.map.get(this._key(cx, cz));
        if (a === undefined) continue;
        for (let i = 0; i < a.length; i++) {
          const e = a[i];
          if (filter && !filter(e)) continue;
          out.push(e);
        }
      }
    }
    return out;
  }
}
