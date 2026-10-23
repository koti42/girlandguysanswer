import { describe, expect, it } from 'vitest';
import { B } from '../../blocks.js';
import {
  MAX_ACCENT_CELLS, MAX_LIGHTS_PER_ROOM, doorClearanceBoxes, planReachability, propBoxes, reachableFromStreet, validateInterior,
} from './graph.js';

/*
 * Sentetik iç mekân: bounds x10..18, z10..16 (y 64..68). Sokak kapısı z=9 duvarında (x=12), iç hücre (12,10).
 * İki oda: A x10..14 (x 10..13), B x15..18 ; aralarında x=14 duvar çizgisi; iç kapı (14, z13), axis 'z', w1.
 */
function synth() {
  return {
    v: 1,
    kind: 'test',
    variant: 0,
    lotId: 1,
    ownerId: null,
    mood: { hue: 'beyaz', light: 10, ambient: 'vent' },
    bounds: { x0: 10, y0: 64, z0: 10, x1: 18, y1: 68, z1: 16 },
    rooms: [
      { id: 'A', x0: 10, y0: 64, z0: 10, x1: 14, y1: 68, z1: 16, role: 'giris' },
      { id: 'B', x0: 15, y0: 64, z0: 10, x1: 18, y1: 68, z1: 16, role: 'oda' },
    ],
    graph: [['A', 'B', 'd1']],
    doors: [
      { id: 'sokak', kind: 'street', x: 12, y: 64, z: 9, axis: 'x', w: 3, h: 3 },
      { id: 'd1', kind: 'door', x: 14, y: 64, z: 13, axis: 'z', w: 1, h: 3 },
    ],
    props: [],
    lights: [],
    chips: [],
    accents: [],
    obstacles: [],
    entry: { room: 'A', door: 'sokak' },
    streetInside: { x: 12, z: 10 },
  };
}

const prop = (kind, x, z, yaw, slot, y) => ({
  kind, x, y: y === undefined ? 64 : y, z, yaw: yaw || 0, variant: 0, lotId: 1, slot,
});

describe('validateInterior', () => {
  it('geçerli sentetik iç mekân', () => {
    const r = validateInterior(synth());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.stats.rooms).toBe(2);
  });

  it('negatif: şema ve oda hataları', () => {
    const t = (mut, re) => {
      const it = synth();
      mut(it);
      const r = validateInterior(it);
      expect(r.ok).toBe(false);
      expect(r.errors.join('|')).toMatch(re);
    };
    t((it) => { it.rooms[1].x1 = 25; }, /bina hacminin dışında/);
    t((it) => { it.rooms[1].x0 = 13; }, /çakışıyor/);
    t((it) => { it.rooms[1].id = 'A'; }, /yinelendi/);
    t((it) => { it.rooms[1].y1 = it.rooms[1].y0 + 1; }, /alçak/);
    t((it) => { it.rooms = []; }, /oda yok/);
    t((it) => { it.bounds = null; }, /bounds/);
    t((it) => { it.mood = null; }, /mood/);
    t((it) => { it.rooms[0].x0 = 9.5; }, /geçersiz/);
  });

  it('negatif: graf (bağlantısız oda, bilinmeyen kapı, kendine kenar, çift kapı kullanımı, entry yok)', () => {
    const t = (mut, re) => {
      const it = synth();
      mut(it);
      const r = validateInterior(it, { reach: true });
      expect(r.ok, re.source).toBe(false);
      expect(r.errors.join('|')).toMatch(re);
    };
    t((it) => { it.graph = []; it.doors = it.doors.filter((d) => d.id !== 'd1'); }, /erişilemez \(graf\): B/);
    t((it) => { it.graph = [['A', 'B', 'yok']]; }, /bilinmeyen kapı/);
    t((it) => { it.graph = [['A', 'Z', 'd1']]; }, /bilinmeyen oda/);
    t((it) => { it.graph = [['A', 'A', 'd1']]; }, /kendine bağlı/);
    t((it) => { it.graph = [['A', 'B', 'd1'], ['B', 'A', 'd1']]; }, /iki kez/);
    t((it) => { it.entry = null; }, /entry/);
    t((it) => { it.entry = { room: 'Z', door: 'sokak' }; }, /entry/);
    t((it) => { it.graph = [['A', 'B', 'sokak']]; }, /sokak kapısı/);
    t((it) => { it.doors.push({ id: 'd2', kind: 'door', x: 14, y: 64, z: 12, axis: 'z', w: 1, h: 3 }); }, /grafta yok/);
    t((it) => { it.doors = it.doors.filter((d) => d.id !== 'sokak'); }, /sokak kapısı/);
  });

  it('negatif: kapı duvar çizgisinde değil / iki yanı başka odalar', () => {
    const t = (mut, re) => {
      const it = synth();
      mut(it);
      const r = validateInterior(it);
      expect(r.ok).toBe(false);
      expect(r.errors.join('|')).toMatch(re);
    };
    t((it) => { it.doors[1].x = 12; }, /duvar çizgisinde değil/); // oda içinde
    t((it) => { it.doors[1].z = 20; }, /duvar çizgisinde değil/); // odaların dışında
    t((it) => { it.doors[1].w = 3; it.doors[1].z = 10; }, /duvar çizgisinde değil/); // kapı hücresi odanın dışına taşar
    t((it) => { it.doors[1].w = 2; }, /w 1\|3/);
    t((it) => { it.doors[1].axis = 'q'; }, /axis/);
    t((it) => { it.doors[1].kind = 'portal'; }, /tür geçersiz/);
    t((it) => { it.doors[1].lock = { id: 'k1', kind: 'olmayan', tier: 0 }; }, /kilit geçersiz/);
    t((it) => { it.doors[1].lock = { id: 'k1', kind: 'kod', tier: 4 }; }, /kilit geçersiz/);
    t((it) => { it.doors[0].lock = { id: 'k1', kind: 'kod', tier: 1 }; }, /sokak kapısı kilitlenemez/);
    t((it) => {
      it.doors.push({ id: 'd2', kind: 'door', x: 14, y: 64, z: 12, axis: 'z', w: 1, h: 3, lock: { id: 'k1', kind: 'kod', tier: 1 } });
      it.doors[1].lock = { id: 'k1', kind: 'kart', tier: 1 };
      it.graph.push(['A', 'B', 'd2']);
    }, /kilit kimliği yinelendi/);
  });

  it('pozitif: geçerli kilit alanları ve dikey geçit (merdiven) kabul edilir; negatif: alçak üst oda, from/to dışarıda', () => {
    const it = synth();
    it.doors[1].lock = { id: 'k1', kind: 'mini_hack', tier: 2, data: { x: 1 } };
    expect(validateInterior(it).errors).toEqual([]);
    const mk = () => {
      const u = synth();
      u.bounds.y1 = 70;
      u.rooms[0].y1 = 70;
      u.rooms[1].y1 = 67; // alt: 64,65,66 ; döşeme satırı 67 ; üst: 68,69
      u.rooms.push({ id: 'U', x0: 15, y0: 68, z0: 10, x1: 18, y1: 70, z1: 16, role: 'asma' });
      u.doors.push({
        id: 'm1', kind: 'stair', x: 16, y: 64, z: 12, axis: 'x', w: 1, h: 3, from: [16, 12], to: [16, 14], rect: { x0: 16, z0: 12, x1: 17, z1: 14 },
      });
      u.graph.push(['B', 'U', 'm1']);
      return u;
    };
    expect(validateInterior(mk()).errors).toEqual([]);
    const bad1 = mk();
    bad1.rooms[2].y1 = 69; // 1 satır
    bad1.rooms[2].y0 = 68;
    expect(validateInterior(bad1).errors.join('|')).toMatch(/alçak/);
    const bad2 = mk();
    bad2.doors[2].to = [11, 11];
    expect(validateInterior(bad2).errors.join('|')).toMatch(/to üst odada değil/);
    const bad3 = mk();
    bad3.doors[2].from = [11, 11];
    expect(validateInterior(bad3).errors.join('|')).toMatch(/from alt odada değil/);
    const bad4 = mk();
    delete bad4.doors[2].from;
    expect(validateInterior(bad4).errors.join('|')).toMatch(/from.to ister/);
    const bad5 = mk();
    bad5.graph[1] = ['U', 'B', 'm1']; // yön ters: B üstte değil
    expect(validateInterior(bad5).errors.join('|')).toMatch(/A odasından yüksekte/);
    // merdiven ayak izine prop koymak yasak
    const bad6 = mk();
    bad6.props = [prop('koli', 16.5, 12.5, 0, 64)];
    expect(validateInterior(bad6).errors.join('|')).toMatch(/dikey geçit alanı dolu/);
  });

  it('negatif: ışık sınırı ve geçersiz ışıklar', () => {
    const it = synth();
    for (let i = 0; i < MAX_LIGHTS_PER_ROOM; i++) it.lights.push({ x: 10 + i, y: 67, z: 11, room: 'A', type: 'panel', level: 15 });
    expect(validateInterior(it).ok).toBe(true);
    it.lights.push({ x: 11, y: 67, z: 12, room: 'A', type: 'panel', level: 15 });
    expect(validateInterior(it).errors.join('|')).toMatch(/ışık sayısı 5/);
    const j = synth();
    j.lights.push({ x: 99, y: 67, z: 12, room: 'A', type: 'panel', level: 15 });
    expect(validateInterior(j).errors.join('|')).toMatch(/odasının dışında/);
    const k = synth();
    k.lights.push({ x: 11, y: 67, z: 12, room: 'Z', type: 'panel', level: 15 });
    expect(validateInterior(k).errors.join('|')).toMatch(/oda yok/);
    const l = synth();
    l.lights.push({ x: 11, y: 67, z: 12, room: 'A', type: 'panel', level: 0 });
    expect(validateInterior(l).errors.join('|')).toMatch(/seviye/);
    // tavan satırına gömülü panel (y = oda üst sınırı) geçerli
    const m = synth();
    m.lights.push({ x: 11, y: 68, z: 12, room: 'A', type: 'panel', level: 15 });
    expect(validateInterior(m).ok).toBe(true);
  });

  it('negatif: aksan emisyon bütçesi', () => {
    const it = synth();
    it.accents.push({ kind: 'strip', x0: 10, y0: 66, z0: 10, x1: 14, y1: 67, z1: 16, block: 229 });
    expect(validateInterior(it).ok).toBe(true);
    for (let i = 0; i < 6; i++) it.accents.push({ kind: 'strip', x0: 10, y0: 66, z0: 10, x1: 14, y1: 67, z1: 16, block: 229 });
    expect(validateInterior(it).errors.join('|')).toMatch(/aksan emisyon/);
    expect(MAX_ACCENT_CELLS).toBe(120);
  });

  it('proplar: bilinmeyen anahtar, odada olmayan, dışarı taşan, örtüşen, çekirdek içinde, slot yinelenen', () => {
    const t = (props, re, mut) => {
      const it = synth();
      it.props = props;
      if (mut) mut(it);
      const r = validateInterior(it);
      expect(r.ok, re.source).toBe(false);
      expect(r.errors.join('|')).toMatch(re);
    };
    t([prop('olmayan_prop', 11.5, 11.5, 0, 64)], /tanım yok/);
    t([prop('masa', 30.5, 30.5, 0, 64)], /hiçbir odada değil|dışında/);
    t([prop('masa', 10.5, 11.5, 0, 64)], /çarpışma (odasının|hacmi) dışında/); // 2 geniş masa sınır dışına taşar
    t([prop('masa', 12, 12.5, 0, 64), prop('sandalye', 12.5, 12.5, 0, 65)], /örtüşüyor/);
    t([prop('masa', 12, 12.5, 0, 64), prop('masa', 12, 14.5, 0, 64)], /slot yinelendi/);
    t([prop('masa', 12, 12.5, 0, 64)], /engelin/, (it) => { it.obstacles = [{ x0: 11, z0: 12, x1: 13, z1: 13 }]; });
    // geçerli: iki masa ayrı
    const ok = synth();
    ok.props = [prop('masa', 11, 14.5, 0, 64), prop('masa', 17, 11.5, 0, 65)];
    expect(validateInterior(ok).errors).toEqual([]);
    // kollider'sız prop (halı) üst üste olabilir
    const ok2 = synth();
    ok2.props = [prop('masa', 11, 14.5, 0, 64), prop('hali', 11, 14.5, 0, 65)];
    expect(validateInterior(ok2).errors).toEqual([]);
  });

  it('kapı önü 3×2 boş: sokak kapısı, iç kapı, kapı/kilit düzeneği muaf', () => {
    const t = (props, re) => {
      const it = synth();
      it.props = props;
      const r = validateInterior(it);
      expect(r.ok).toBe(false);
      expect(r.errors.join('|')).toMatch(re);
    };
    t([prop('koli', 12.5, 10.5, 0, 64)], /kapı önü 3×2 boş değil: sokak/); // sokak kapısı içi
    t([prop('koli', 12.5, 13.5, 0, 64)], /kapı önü 3×2 boş değil: d1/); // iç kapı önü (A tarafı, x 12-13)
    t([prop('koli', 15.5, 13.5, 0, 64)], /kapı önü 3×2 boş değil: d1/); // B tarafı
    const ok = synth();
    ok.props = [prop('koli', 10.5, 14.5, 0, 64), prop('koli', 17.5, 11.5, 0, 65), prop('kapi', 14.5, 13.5, 1, 66)];
    expect(validateInterior(ok).errors).toEqual([]);
    // kapı önü sınırı: tam 2 hücre derinlik (z 13: x 12.. kapı x=14 → alan x [12,17)); koli x 11.5 (11..12) dışında
    const zones = doorClearanceBoxes({ x: 14, y: 64, z: 13, axis: 'z' });
    expect(zones[0]).toEqual([12, 64, 12, 17, 67, 15]);
    const zx = doorClearanceBoxes({ x: 14, y: 64, z: 9, axis: 'x' });
    expect(zx[0]).toEqual([13, 64, 7, 16, 67, 12]);
  });

  it('ulaşılabilir hava < %70 hatası (plan düzeyi): odayı sıralı dolaplarla kapat', () => {
    const it = synth();
    // A odasına giriş sonrası 4 genişlikte tam duvar boyu dolap sırası → kalan oda kapalı
    it.props = [];
    let slot = 64;
    for (let z = 10; z < 16; z++) for (let x = 10; x < 14; x++) if (!(x === 14) && !(z === 10)) it.props.push(prop('koli', x + 0.5, z + 0.5, 0, slot++));
    const r = validateInterior(it, { reach: true });
    expect(r.ok).toBe(false);
    expect(r.errors.join('|')).toMatch(/ulaşılabilir hava|ulaşılamayan oda/);
  });
});

describe('planReachability', () => {
  it('boş sentetik: %100; oda sayıları; prop tıkanıklığı oranı düşürür', () => {
    const it = synth();
    const r = planReachability(it);
    expect(r.fraction).toBe(1);
    expect(r.unreachableRooms).toEqual([]);
    expect(r.total).toBe(4 * 6 + 3 * 6);
    // B odası girişini 1 geniş kapıda kolilerle kapat
    it.props = [prop('koli', 13.5, 12.5, 0, 64), prop('koli', 13.5, 13.5, 0, 65), prop('koli', 13.5, 14.5, 0, 66)];
    const r2 = planReachability(it);
    expect(r2.unreachableRooms).toEqual(['B']);
    expect(r2.rooms.B.reached).toBe(0);
    expect(r2.fraction).toBeLessThan(0.7);
  });

  it('alçak halı/yarım yükseklik engel değildir; yüksek raf engeldir; engel dikdörtgeni hücreleri dışlar', () => {
    const it = synth();
    it.props = [prop('hali', 12, 12.5, 0, 64)];
    expect(planReachability(it).fraction).toBe(1);
    const base = planReachability(it).total;
    it.props = [prop('raf_unitesi', 11.5, 12.5, 0, 64)];
    expect(planReachability(it).total).toBeLessThan(base);
    it.props = [];
    it.obstacles = [{ x0: 16, z0: 12, x1: 18, z1: 14 }];
    expect(planReachability(it).total).toBe(base - 4);
  });

  it('başlangıç hücresi tıkalıysa startBlocked, fraction 0', () => {
    const it = synth();
    it.props = [prop('koli', 12.5, 10.5, 0, 64)];
    const r = planReachability(it);
    expect(r.startBlocked).toBe(true);
    expect(r.fraction).toBe(0);
  });
});

/* ---------------------------------------------------------------------------------------------
 * Blok dünyası BFS (reachableFromStreet)
 * ------------------------------------------------------------------------------------------- */
function voxelWorld() {
  const m = new Map();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  const w = {
    set(x, y, z, id) { m.set(key(x, y, z), id); },
    box(x0, y0, z0, x1, y1, z1, id) { for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) m.set(key(x, y, z), id); },
    getBlock(x, y, z) { return m.get(key(x, y, z)) || 0; },
  };
  // zemin y63 (sokak + iç), x 4..24, z 4..22
  w.box(4, 63, 4, 24, 64, 22, B.CONCRETE_WHITE);
  // dış duvar halkası x9..18, z9..16 (y 64..67) + tavan y68
  const ring = (x0, z0, x1, z1) => {
    w.box(x0, 64, z0, x1 + 1, 68, z0 + 1, B.CONCRETE_GRAY || 76);
    w.box(x0, 64, z1, x1 + 1, 68, z1 + 1, 76);
    w.box(x0, 64, z0, x0 + 1, 68, z1 + 1, 76);
    w.box(x1, 64, z0, x1 + 1, 68, z1 + 1, 76);
  };
  ring(9, 9, 18, 16);
  w.box(9, 68, 9, 19, 69, 17, 76);
  // sokak kapısı: x11..13 z9, y64..66 → kayar kapı 239
  w.box(11, 64, 9, 14, 67, 10, 239);
  // iç bölme x=14 (z10..15) kapı z13 (1 geniş)
  w.box(14, 64, 10, 15, 68, 16, 76);
  w.box(14, 64, 13, 15, 67, 14, 0);
  return w;
}

const building = (it) => ({ interior: it, door: { front: { x: 12, z: 8 }, inside: { x: 12, z: 10 } } });

describe('reachableFromStreet (blok BFS)', () => {
  it('açık iç mekân: sokaktan iki oda da %100 ulaşılır; kayar kapı geçilebilir sayılır', () => {
    const w = voxelWorld();
    const it = synth();
    const r = reachableFromStreet(w, it.props, building(it));
    expect(r.streetOk).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.fraction).toBe(1);
    expect(r.unreachableRooms).toEqual([]);
    expect(r.rooms.map((q) => q.id)).toEqual(['A', 'B']);
    // kapalı kayar kapı opts ile engel yapılabilir
    const r2 = reachableFromStreet(w, it.props, building(it), { passIds: [] });
    expect(r2.fraction).toBe(0);
    expect(r2.ok).toBe(false);
  });

  it('iç kapı bloklanırsa B odası ulaşılamaz; kollider prop bloklar, kapı propu geçilebilir sayılır', () => {
    const w = voxelWorld();
    w.box(14, 64, 13, 15, 67, 14, 76); // kapıyı kapat
    const it = synth();
    const r = reachableFromStreet(w, it.props, building(it));
    expect(r.ok).toBe(false);
    expect(r.unreachableRooms).toEqual(['B']);
    expect(r.unreachable.length).toBeGreaterThan(0);
    // kapı önündeki tek geçiş hücresini koli ile kapat
    const r3 = reachableFromStreet(voxelWorld(), [prop('koli', 15.5, 13.5, 0, 64)], building(it));
    expect(r3.ok).toBe(false);
    expect(r3.rooms.find((q) => q.id === 'B').reached).toBe(0);
    expect(r3.rooms.find((q) => q.id === 'A').fraction).toBe(1);
    // kapı etiketli prop (kapi) çarpışması açık sayılır
    const r5 = reachableFromStreet(voxelWorld(), [prop('kapi', 14.5, 13.5, 1, 64)], building(it));
    expect(r5.ok).toBe(true);
    expect(r5.fraction).toBe(1);
    // alçak halı engel değil
    const r6 = reachableFromStreet(voxelWorld(), [prop('hali', 15.5, 13.5, 0, 64)], building(it));
    expect(r6.ok).toBe(true);
  });

  it('zıplama ve düşme kuralları: +1 zıplanır, +2 geçilmez, yüksek ama tavanlı yerde durulmaz; merdiven dikey kenar', () => {
    const it = synth();
    it.bounds.y1 = 72;
    it.rooms[0].y1 = 72;
    it.rooms[1].y1 = 72;
    const w0 = () => {
      const w = voxelWorld();
      w.box(9, 68, 9, 19, 69, 17, 0); // eski alçak tavan
      w.box(9, 68, 9, 19, 72, 10, 76);
      w.box(9, 68, 16, 19, 72, 17, 76);
      w.box(9, 68, 9, 10, 72, 17, 76);
      w.box(18, 68, 9, 19, 72, 17, 76);
      w.box(14, 68, 10, 15, 72, 16, 76);
      w.box(9, 72, 9, 19, 73, 17, 76);
      return w;
    };
    const pr = (w) => reachableFromStreet(w, [], building(it));
    // +1 (zıplanır): A odasında 1 yüksek küp
    const w1 = w0();
    w1.set(11, 64, 12, 76);
    let r = pr(w1);
    expect(r.unreachable.length).toBe(0);
    expect(r.fraction).toBe(1);
    // +2 izole küp sütunu: üstü ulaşılamaz
    const w2 = w0();
    w2.box(11, 64, 12, 12, 66, 13, 76);
    r = pr(w2);
    expect(r.unreachable).toEqual([{ x: 11, y: 66, z: 12 }]);
    // +1 ve +2 komşu: merdiven gibi çıkılır
    const w3 = w0();
    w3.box(11, 64, 12, 12, 66, 13, 76);
    w3.set(11, 64, 13, 76);
    r = pr(w3);
    expect(r.unreachable.length).toBe(0);
    // 4 yüksek platform: tepesine çıkılamaz (düşülebilir ama çıkılamaz)
    const w4 = w0();
    w4.box(11, 64, 12, 12, 68, 13, 76);
    r = pr(w4);
    expect(r.unreachable).toEqual([{ x: 11, y: 68, z: 12 }]);
    // merdiven: yanına LADDER sütunu (64..67) ile 4 yüksek platforma çıkılır
    const w5 = w0();
    w5.box(11, 64, 12, 12, 68, 13, 76);
    w5.box(11, 64, 13, 12, 68, 14, B.LADDER);
    r = pr(w5);
    expect(r.unreachable.length).toBe(0);
    // aşağı düşme ≤3: kuyuya düşülen hücre sonrası geri çıkış YOK ama BFS tek yönlü ulaşılabilirliği sayar (hücre ulaşıldı)
    const w6 = w0();
    w6.box(11, 63, 12, 12, 64, 13, 0); // 1 çukur
    r = pr(w6);
    expect(r.unreachable.length).toBe(0);
  });

  it('yarım blok (plaka/küp) basamakları yürünür: 2 hücre = 1 blok yükseklik', () => {
    const it = synth();
    it.bounds.y1 = 72;
    it.rooms[1].y1 = 72;
    it.rooms[0].y1 = 72;
    const w = voxelWorld();
    w.box(9, 68, 9, 19, 69, 17, 0);
    w.box(9, 68, 9, 19, 72, 10, 76);
    w.box(9, 68, 16, 19, 72, 17, 76);
    w.box(9, 68, 9, 10, 72, 17, 76);
    w.box(18, 68, 9, 19, 72, 17, 76);
    w.box(14, 68, 10, 15, 72, 16, 76);
    w.box(9, 72, 9, 19, 73, 17, 76);
    // B odası boyunca (x15..17) +z yönünde yarım basamaklar; sütun z=14,15 → 6 basamak (3 blok): hh=1..6
    for (let i = 0; i < 6; i++) {
      const z = 10 + i;
      const hh = i + 1;
      const m = hh >> 1;
      for (let x = 16; x < 18; x++) {
        if (m > 0) w.box(x, 64, z, x + 1, 64 + m, z + 1, B.CONCRETE_BLUE);
        if (hh & 1) w.set(x, 64 + m, z, B.SLAB);
      }
    }
    const r = reachableFromStreet(w, [], building(it));
    expect(r.unreachable).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('sokak başlangıcı zemin yoksa streetOk=false', () => {
    const w = voxelWorld();
    w.box(10, 63, 4, 20, 64, 9, 0);
    const it = synth();
    const r = reachableFromStreet(w, [], building(it));
    expect(r.streetOk).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('propBoxes: katalog/PROP_DEFS anahtarı ve t ile çözülür, kolliderlı kutular yaw ile döner', () => {
    const e = propBoxes([prop('masa', 5, 5, 0, 1), prop('masa', 5, 5, 1, 2), prop('bank', 5, 5, 0, 3), { t: 14, x: 1, y: 64, z: 1, yaw: 0 }, { kind: 'yok', x: 0, y: 0, z: 0 }, null].filter(Boolean));
    expect(e[0].boxes.length).toBe(1);
    const w0 = e[0].boxes[0][3] - e[0].boxes[0][0];
    const w1 = e[1].boxes[0][3] - e[1].boxes[0][0];
    expect(w0).toBeGreaterThan(w1); // 90° dönünce x/z uzunlukları yer değiştirir
    expect(e[2].def.key).toBe('bank');
    expect(e[3].def).not.toBeNull();
    expect(e[4].def).toBeNull();
  });
});
