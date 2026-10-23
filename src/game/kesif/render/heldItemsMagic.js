/*
 * KEŞİF eşya 3D modelleri — BÜYÜ asası ('staff' türü). heldItems.js BUILDERS tablosuna katılır.
 *
 * Asa: sarmal bantlı ahşap gövde, üstünde üç metal pençenin tuttuğu parlayan kristal; kristal asanın rengidir (it.color)
 * ve nabız gibi atar. Model yerel uzayı: +Y asa uzunluğu, orijin tutma noktası (gövde ~0,7 m).
 * userData.update(t): kristal parıltısı + yavaş dönen mini halka; userData.crystal: uç mesh'i (büyü ışıltısı konumu için).
 */
import {
  THREE, G, stdMat, basicMat, mesh, unitSphere, unitCyl, unitOcta, unitCone, unitTorus,
} from './heldItemsKit.js';
import { hueRotate } from './skins.js';

const PI = Math.PI;

function buildStaff(spec, ctx) {
  const col = spec.color || 0xb25cff;
  const sk = spec.skin && spec.skin.slot === 'asa' ? spec.skin : null; // Keşif mağaza görünümü: kristal rengi (+ isteğe bağlı halka, ton döngüsü)
  const ringCol = sk && sk.ring !== null ? sk.ring : col;
  const cycle = !!(sk && sk.cycle && ctx && ctx.anim); // low kademe / kısıtlı hareket: sabit ilk renk
  const g = new THREE.Group();
  const wood = stdMat(0x5e3c20, { rough: 0.78 });
  const woodLight = stdMat(0x7c5430, { rough: 0.7 });
  const metal = stdMat(0xc9ced6, { rough: 0.3, metal: 0.45 });
  const dark = stdMat(0x2a2030, { rough: 0.6, metal: 0.2 });
  const wrap = stdMat(0x3a2a52, { rough: 0.85 });
  // gövde: hafif konik, üstte kalınlaşır
  g.add(mesh(unitCyl(), wood, 0, 0.26, 0, 0, 0, 0, 0.0155, 0.74, 0.0155));
  g.add(mesh(unitCyl(), woodLight, 0.003, 0.3, 0.002, 0, 0, 0.012, 0.0072, 0.5, 0.0072));
  g.add(mesh(unitSphere(), dark, 0, -0.105, 0, 0, 0, 0, 0.021, 0.026, 0.021));
  // bilek bantları (sarmal)
  for (let i = 0; i < 5; i++) g.add(mesh(unitCyl(), wrap, 0, -0.04 + i * 0.026, 0, 0, 0, 0, 0.0185, 0.012, 0.0185));
  g.add(mesh(unitCyl(), metal, 0, 0.12, 0, 0, 0, 0, 0.0195, 0.014, 0.0195));
  g.add(mesh(unitCyl(), metal, 0, 0.36, 0, 0, 0, 0, 0.0195, 0.012, 0.0195));
  // baş: yukarı doğru açılan üç pençe
  const claw = G('staff:claw', () => new THREE.ConeGeometry(0.011, 0.15, 5));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * PI * 2;
    const c = mesh(claw, metal, Math.cos(a) * 0.026, 0.46, Math.sin(a) * 0.026, 0, 0, 0, 1, 1, 1);
    c.rotation.set(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22);
    g.add(c);
  }
  g.add(mesh(unitCyl(), metal, 0, 0.385, 0, 0, 0, 0, 0.024, 0.02, 0.024));
  // kristal: parlak çekirdek + iç halo + iki yüzen kıymık
  const crystal = new THREE.Group();
  crystal.position.set(0, 0.5, 0);
  const cMat = basicMat(col, { bright: 1.35 });
  const hMat = basicMat(col, { add: true, opacity: 0.2 });
  const rMat = basicMat(ringCol, { add: true, opacity: 0.5 });
  const oMat = basicMat(col, { bright: 1.25 });
  crystal.add(mesh(unitOcta(), cMat, 0, 0, 0, 0, 0.5, 0, 0.026, 0.044, 0.026));
  crystal.add(mesh(unitOcta(), basicMat(0xffffff, { add: true, opacity: 0.55 }), 0, 0, 0, 0, 0.5, 0, 0.014, 0.026, 0.014));
  const halo = mesh(unitSphere(), hMat, 0, 0, 0, 0, 0, 0, 0.07, 0.07, 0.07);
  crystal.add(halo);
  const ring = mesh(unitTorus(), rMat, 0, 0, 0, PI / 2.4, 0, 0, 0.05, 0.05, 0.05);
  crystal.add(ring);
  const orbit = new THREE.Group();
  [0, 1].forEach((i) => orbit.add(mesh(unitOcta(), oMat, Math.cos(i * PI) * 0.062, 0, Math.sin(i * PI) * 0.062, 0, 0, 0, 0.008, 0.012, 0.008)));
  crystal.add(orbit);
  g.add(crystal);
  g.add(mesh(unitCone(), dark, 0, -0.13, 0, PI, 0, 0, 0.012, 0.03, 0.012));
  g.userData.size = 0.72;
  g.userData.crystal = crystal;
  // Gökkuşağı: ortak (renk anahtarlı) önbellek malzemesi DEĞİŞTİRİLMEZ; ton döngüsü modele özel klonlarda (aynı malzeme türü/program)
  let cyc = null;
  if (cycle) {
    const own = (m) => { const c = m.clone(); g.userData.owned = g.userData.owned || []; g.userData.owned.push(c); return c; };
    cyc = { c: own(cMat), h: own(hMat), r: own(rMat), o: own(oMat), last: -1 };
    crystal.children.forEach((m) => {
      if (m.material === cMat) m.material = cyc.c;
      else if (m.material === hMat) m.material = cyc.h;
      else if (m.material === rMat) m.material = cyc.r;
    });
    halo.material = cyc.h;
    ring.material = cyc.r;
    orbit.children.forEach((m) => { m.material = cyc.o; });
  }
  g.userData.update = (t) => {
    if (cyc) {
      const step = Math.floor(t * 12); // yavaş: 8 sn'de bir tur, ≤12 güncelleme/sn
      if (step !== cyc.last) {
        cyc.last = step;
        const ph = (t / 8) % 1;
        cyc.c.color.setHex(hueRotate(col, ph)).multiplyScalar(1.35);
        cyc.h.color.setHex(hueRotate(col, ph));
        cyc.r.color.setHex(hueRotate(ringCol, ph));
        cyc.o.color.setHex(hueRotate(col, ph)).multiplyScalar(1.25);
      }
    }
    const k = 0.5 + 0.5 * Math.sin(t * 2.6);
    halo.scale.setScalar(0.062 + 0.018 * k);
    ring.rotation.z = t * 1.3;
    orbit.rotation.y = t * 1.9;
    crystal.rotation.y = Math.sin(t * 0.9) * 0.35;
  };
  return g;
}

export const MAGIC_BUILDERS = { staff: buildStaff };
