import { describe, expect, it } from 'vitest';
import { planReachability, reachableFromStreet } from './graph.js';

/*
 * qa_p2 — graph.js ulaşılabilirlik modeli düzeltmeleri (Faz 2 kapısı):
 *   1. zıplama +1: 3 yüksek tavanda (ayak+3 katı) tam küp basamağa çıkılır (cityNavKit ile aynı; eskiden ayak+3 serbest isteniyordu)
 *   2. düşüş döşeme/tavandan GEÇMEZ (eskiden asma kat üstünden altındaki kapalı cebe "düşülüyor" sayılıyordu)
 *   3. opts.trap: sokaktan girilip geri dönülemeyen hücreler (3 blok çukur) bulunur; basamaklı oluk tuzak değildir
 *   4. planReachability: merdiven koşusu (rect) yürünebilir hücre değildir (kütle / üst kat boşluğu)
 */
const CUBE = 73;
const B = { x0: 10, y0: 64, z0: 10, x1: 20, y1: 68, z1: 20 };
/** Çukur testleri: sayım hacmi çukur tabanını da kapsar. */
const DEEP = { x0: 10, y0: 58, z0: 10, x1: 20, y1: 68, z1: 20 };

function make(extra, bounds) {
  // zemin: y ≤ 63 dolu (x 5..24, z 5..24); gerisi hava; sokak şeridi z 5..9 aynı zeminde
  const edit = new Map();
  const set = (x, y, z, id) => edit.set(x + ',' + y + ',' + z, id);
  const box = (x0, y0, z0, x1, y1, z1, id) => {
    for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) set(x, y, z, id);
  };
  if (extra) extra(set, box);
  const world = (x, y, z) => {
    const k = x + ',' + y + ',' + z;
    if (edit.has(k)) return edit.get(k);
    if (x < 5 || x >= 25 || z < 5 || z >= 25) return 0;
    return y <= 63 ? CUBE : 0;
  };
  const building = {
    interior: { bounds: bounds || B, rooms: [{ id: 'r', x0: 10, y0: 64, z0: 10, x1: 20, y1: 68, z1: 20 }] },
    door: { front: { x: 15, z: 9 } },
  };
  return { world, building };
}

describe('reachableFromStreet — hareket modeli', () => {
  it('düz oda: tüm hücreler ulaşılır, tuzak yok', () => {
    const { world, building } = make();
    const r = reachableFromStreet(world, [], building, { trap: true });
    expect(r.streetOk).toBe(true);
    expect(r.reached).toBe(r.total);
    expect(r.trapped.count).toBe(0);
  });

  it('3 yüksek tavan altında 1 blok basamağa çıkılır ve basamaktan inilir (oluk tuzağı yok)', () => {
    const { world, building } = make((set, box) => {
      box(10, 67, 10, 20, 68, 20, CUBE); // tavan: hava y64..66
      box(13, 64, 10, 20, 65, 12, CUBE); // sahne (ayak 65), kuzeyde 1 geniş oluk x 10..12
    });
    const r = reachableFromStreet(world, [], building, { trap: true });
    // sahne üstü (ayak 65) ulaşılır
    expect(r.unreachable.filter((u) => u.y === 65)).toEqual([]);
    expect(r.reached).toBe(r.total);
    expect(r.trapped.count).toBe(0);
  });

  it('asma kat döşemesinden alttaki kapalı cebe düşülmez (eskiden sahte ulaşılır sayılıyordu)', () => {
    const { world, building } = make((set, box) => {
      // 4×4 cep (x 12..13, z 14..15) hava y64..65; çevresi dolu halka y64..65; üstü döşeme y66 → üst yüz ayak 67
      box(11, 64, 13, 15, 67, 17, CUBE);
      box(12, 64, 14, 14, 66, 16, 0);
      // üst yüze çıkış: doğuda 3 basamak (ayak 65, 66, 67)
      set(17, 64, 14, CUBE);
      box(16, 64, 14, 17, 66, 15, CUBE);
      box(15, 64, 14, 16, 67, 15, CUBE);
    });
    const r = reachableFromStreet(world, [], building, {});
    const pocket = r.unreachable.filter((u) => u.x >= 12 && u.x <= 13 && u.z >= 14 && u.z <= 15 && u.y === 64);
    expect(pocket.length).toBe(4); // dörtlü cep sokaktan ulaşılamaz (gerçekte kapalı)
    // üst yüz (ayak 67) basamaklarla ulaşılır
    expect(r.unreachable.some((u) => u.y === 67)).toBe(false);
  });

  it('3 blok çukur: girilir ama çıkılamaz → trapped bulunur; opts.trap yoksa trapped alanı yok', () => {
    const { world, building } = make((set, box) => {
      box(12, 61, 14, 14, 64, 16, 0);
      box(12, 60, 14, 14, 61, 16, CUBE);
    }, DEEP);
    const r = reachableFromStreet(world, [], building, { trap: true });
    expect(r.trapped.count).toBe(4);
    expect(r.trapped.samples.length).toBe(4);
    expect(r.trapped.samples[0].y).toBe(61);
    expect(r.trapped.samples[0].from.length).toBeGreaterThan(0);
    expect(reachableFromStreet(world, [], building, {}).trapped).toBeUndefined();
  });

  it('1 blok çukur çıkılabilir (zıplama): tuzak yok', () => {
    const { world, building } = make((set, box) => {
      box(12, 63, 14, 14, 64, 16, 0);
      box(12, 62, 14, 14, 63, 16, CUBE);
    }, DEEP);
    const r = reachableFromStreet(world, [], building, { trap: true });
    expect(r.trapped.count).toBe(0);
    expect(r.reached).toBe(r.total);
  });
});

describe('planReachability — merdiven koşusu yürünebilir hücre değildir', () => {
  const room = (id, y0, y1) => ({
    id, x0: 0, y0, z0: 0, x1: 6, y1, z1: 5, role: 'oda',
  });
  const it0 = () => ({
    rooms: [room('alt', 64, 67), room('ust', 67, 70)],
    graph: [['alt', 'ust', 'm1']],
    doors: [{
      id: 'm1', kind: 'stair', x: 0, y: 64, z: 0, axis: 'x', w: 1, h: 3, from: [0, 0], to: [5, 0], rect: { x0: 1, z0: 0, x1: 5, z1: 2 },
    }],
    props: [],
    obstacles: [],
    entry: { room: 'alt' },
    streetInside: { x: 0, z: 0 },
  });

  it('rect hücreleri iki katta da yürünebilir sayılmaz; from→to bağı kalır', () => {
    const r = planReachability(it0());
    expect(r.rooms.alt.total).toBe(6 * 5 - 4 * 2);
    expect(r.rooms.ust.total).toBe(6 * 5 - 4 * 2);
    expect(r.rooms.ust.reached).toBe(r.rooms.ust.total); // üst kat from→to bağıyla ulaşılır
    expect(r.unreachableRooms).toEqual([]);
  });

  it('merdiven başlangıç hücresi kapanırsa üst kat ulaşılamaz', () => {
    const it = it0();
    it.props = [];
    it.obstacles = [{ x0: 0, z0: 0, x1: 1, z1: 1 }]; // from hücresi dolu → giriş de dolu
    const r = planReachability(it);
    expect(r.startBlocked || r.unreachableRooms.length > 0).toBe(true);
  });
});
