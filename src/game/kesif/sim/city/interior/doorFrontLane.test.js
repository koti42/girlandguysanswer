/*
 * closeout/C (qa_p2 seyrek "çıkış … stuck 5"): kök neden ÜRÜN DEĞİL, yürüyüş betiğinin ölçüm hedefi.
 *
 * Kapı önünün (kapı hücresinin hemen dışı: 2 dış × 3 yan hücre) hiçbir trafik şeridi ekseninin ya da kavşak hareketinin araç GÖVDESİ
 * (en geniş sınıf halfWid + 0.5 pay) içinde kalmadığını kanıtlar: kırmızı ışıkta bekleyen bir araç kapıyı / kapı önünü KAPATAMAZ.
 * Takılmanın tek yeri, kapıdan 6 blok dışarıdaki "out6" yürüyüş hedefi (bir şeridin ortasına düşer; ışıkta bekleyen araç tam hedefin üstünde
 * durur — GPU kanıtı: _kesifHarness/out_city/p5/closeout/C/final/). Bu invaryant bozulursa gerçek bir "kapıda hapis" kusuru doğar.
 */
import { describe, expect, it } from 'vitest';
import { citySeed } from '../cityPlanTestKit.js';
import { trafficNet } from '../vehicle/junctions.js';
import { TCLASS } from '../vehicle/trafficCars.js';
import { interiorLots } from './testKit.js';

const HW = Math.max(...TCLASS.map((c) => c.halfWid));
const FACE = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

function distSeg(x, z, s) {
  const dx = s[2] - s[0];
  const dz = s[3] - s[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / l2));
  return Math.hypot(x - (s[0] + t * dx), z - (s[1] + t * dz));
}

describe('kapı önü trafik şeridinden uzak (araç kapıyı kapatamaz)', () => {
  for (const si of [0, 1, 2]) {
    it(`tohum ${si}: tüm kapı önleri şerit eksenine/kavşak hareketine > halfWid+0.5`, () => {
      const seed = citySeed(si);
      const tn = trafficNet(seed);
      const segs = [];
      for (const de of tn.dedges) {
        if (!de || de.bridge || de.tunnel) continue;
        for (let l = 0; l < de.lanes; l++) {
          const off = (l + 0.5) * de.laneW;
          segs.push([de.x0 + de.hx * de.s0 + de.rx * off, de.z0 + de.hz * de.s0 + de.rz * off, de.x0 + de.hx * de.s1 + de.rx * off, de.z0 + de.hz * de.s1 + de.rz * off]);
        }
      }
      const pts = [];
      for (const J of tn.junctions) { if (J) for (const mv of J.moves || []) for (let i = 0; i < mv.N; i++) pts.push([mv.px[i], mv.pz[i]]); }
      let doors = 0;
      const bad = [];
      for (const { bp } of interiorLots(seed, {})) {
        const d = bp.doors[0];
        if (!d) continue;
        doors++;
        const fv = FACE[d.face];
        const ax = [-fv[1], fv[0]];
        const fx = d.front.x + 0.5;
        const fz = d.front.z + 0.5;
        let md = 1e9;
        for (let o = 0; o <= 1; o++) {
          for (let a = -1; a <= 1; a++) {
            const x = fx + fv[0] * o + ax[0] * a;
            const z = fz + fv[1] * o + ax[1] * a;
            for (const s of segs) md = Math.min(md, distSeg(x, z, s));
            for (const p of pts) md = Math.min(md, Math.hypot(x - p[0], z - p[1]));
          }
        }
        if (md < HW + 0.5) bad.push({ lot: bp.id, kind: bp.interior.kind, md: +md.toFixed(2) });
      }
      expect(doors).toBeGreaterThan(500);
      expect(bad).toEqual([]);
    }, 120000);
  }
});
