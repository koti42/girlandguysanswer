/*
 * KEŞİF sim — parkur kanca kısayolu: demir noktası seçimi + gerçek fizikte kanıt (saf; belirlenimli).
 *
 * Kanca fiziği (physics.js): oyuncu nişan noktasına doğru 26 b/s'e çekilir, noktaya 1,5 blok kalınca (ya da
 * 4 sn / takılma) bırakılır ve hız 12 b/s'e kısılır. Demir noktası İKİ PLATFORMUN ARASINA asılırsa oyuncu boşluğun
 * ortasında kalır ve düşer (QA: 30/30 kısayol kullanılamıyordu). Bu yüzden demir, HEDEF platformun hemen üstüne
 * (3–4 blok) konur: çekilen oyuncu hedef platformun üzerinde bırakılır, momentumunu havada keser ve iner.
 *
 *   courseLite(list)                    platform hücrelerinden hafif dünya {getBlock, set}
 *   simGrapple(world, A, B, anchor)     → {ok, start, strategy, ticks} (A'dan kancayla B'ye gerçek fizikte geçiş)
 *   chooseAnchor(list, i, j)            → {x,y,z} | null (ilk kanıtlanmış demir noktası)
 *   simGlide(world, list, from, to, rings) → {ok,...}  planör halkası kısayolu: A'dan zıpla, süzül, B'ye in (gerçek fizik)
 */
import { B } from './blocks.js';
import { createPlayerBody, stepPlayer } from './physics.js';
import { createRayHit, raycastBlocks } from './raycast.js';

const DT = 1 / 60;
const RANGE = 28;

function key(x, y, z) {
  return x + ',' + y + ',' + z;
}

/** Ana yol platformlarının katı hücreleri (üst katman + altındaki katman; sütun/kiriş de kalın sayılır). */
export function courseLite(list) {
  const map = new Map();
  for (const q of list) {
    for (let z = q.z0; z <= q.z1; z++) {
      for (let x = q.x0; x <= q.x1; x++) {
        map.set(key(x, q.y, z), B.POLISHED);
        map.set(key(x, q.y - 1, z), B.POLISHED);
      }
    }
  }
  return {
    getBlock: (x, y, z) => map.get(key(x, y, z)) || 0,
    set: (x, y, z, id) => { if (id) map.set(key(x, y, z), id); else map.delete(key(x, y, z)); },
  };
}

function platIndexAt(list, b) {
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (b.x >= q.x0 - 0.29 && b.x < q.x1 + 1.29 && b.z >= q.z0 - 0.29 && b.z < q.z1 + 1.29 && Math.abs(b.y - (q.y + 1)) < 0.05) return i;
  }
  return -1;
}

function brakeInput(body, yaw) {
  const sp = Math.hypot(body.vx, body.vz);
  if (sp < 0.5) return { moveX: 0, moveZ: 0 };
  const bx = -body.vx / sp;
  const bz = -body.vz / sp;
  return { moveX: bx * Math.cos(yaw) + bz * -Math.sin(yaw), moveZ: bx * -Math.sin(yaw) + bz * -Math.cos(yaw) };
}

function steerInput(body, yaw, tx, tz) {
  const ex = tx - body.x;
  const ez = tz - body.z;
  const m = Math.hypot(ex, ez) || 1;
  const nx = ex / m;
  const nz = ez / m;
  return { moveX: nx * Math.cos(yaw) + nz * -Math.sin(yaw), moveZ: nx * -Math.sin(yaw) + nz * -Math.cos(yaw) };
}

/**
 * A'nın üstünde duran oyuncu demire nişan alıp kanca atar; hedef platform B'de (list[to]) durana dek simüle eder.
 * Dünyada demir blokları (AMETHYST) zaten durmalıdır. Döner {ok, start:{x,z}, strategy}.
 */
export function simGrapple(world, list, from, to, anchor) {
  const A = list[from];
  const Bp = list[to];
  const bcx = (Bp.x0 + Bp.x1 + 1) / 2;
  const bcz = (Bp.z0 + Bp.z1 + 1) / 2;
  const starts = [];
  const cx = (A.x0 + A.x1 + 1) / 2;
  const cz = (A.z0 + A.z1 + 1) / 2;
  starts.push([cx, cz]);
  for (const fx of [0.35, 0.65]) for (const fz of [0.35, 0.65]) starts.push([A.x0 + 0.5 + fx * (A.x1 - A.x0), A.z0 + 0.5 + fz * (A.z1 - A.z0)]);
  const ab = { grapple: true };
  const st = { mode: 'macera' };
  for (const [sx, sz] of starts) {
    for (const strategy of ['none', 'brake', 'steer']) {
      const body = createPlayerBody(sx, A.y + 1, sz);
      for (let q = 0; q < 20; q++) stepPlayer(body, { yaw: 0 }, world, DT, ab, st);
      const eye = { x: body.x, y: body.y + body.eyeH, z: body.z };
      const dx = anchor.x + 0.5 - eye.x;
      const dy = anchor.y + 0.5 - eye.y;
      const dz = anchor.z + 0.5 - eye.z;
      const dd = Math.hypot(dx, dy, dz);
      if (dd > RANGE - 2) break;
      const hit = raycastBlocks(world, eye, { x: dx / dd, y: dy / dd, z: dz / dd }, RANGE, { solidOnly: true, out: createRayHit() });
      if (!hit || hit.x !== anchor.x || hit.y !== anchor.y || hit.z !== anchor.z) break;
      const tgt = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      const yaw = Math.atan2(-(tgt.x - body.x), -(tgt.z - body.z));
      let ended = false;
      for (let t = 0; t < 400; t++) {
        const inp = {
          moveX: 0, moveZ: 0, yaw, sprint: false, jump: false,
        };
        if (t === 0) inp.grapple = tgt;
        if (!body.grapple.active && t > 3) {
          ended = true;
          const c = strategy === 'brake' ? brakeInput(body, yaw) : strategy === 'steer' ? steerInput(body, yaw, bcx, bcz) : null;
          if (c) {
            inp.moveX = c.moveX;
            inp.moveZ = c.moveZ;
          }
        }
        stepPlayer(body, inp, world, DT, ab, st);
        if (body.y < Math.min(A.y, Bp.y) - 4) break;
        if (ended && body.onGround && !body.grapple.active) {
          // iniş: hedef platformda ve (kısa süre sonra) durmuş olmalı
          if (platIndexAt(list, body) === to) {
            for (let k = 0; k < 90; k++) {
              const b2 = brakeInput(body, yaw);
              stepPlayer(body, { moveX: b2.moveX, moveZ: b2.moveZ, yaw }, world, DT, ab, st);
              if (body.y < Bp.y) break;
            }
            // kenarda asılı kalan iniş sayılmaz: gövde merkezi platformun içinde, kenardan en az 0,2 blok payla durmalı
            const inside = body.x >= Bp.x0 + 0.2 && body.x <= Bp.x1 + 0.8 && body.z >= Bp.z0 + 0.2 && body.z <= Bp.z1 + 0.8;
            if (platIndexAt(list, body) === to && inside && Math.abs(body.y - (Bp.y + 1)) < 0.01) return { ok: true, start: { x: sx, z: sz }, strategy, ticks: t };
          }
          break;
        }
      }
    }
  }
  return { ok: false };
}

/** from→to için kanıtlanmış ilk demir noktası: hedef platformun üstünde, kaynağa doğru 0–2 blok kaymış. */
export function chooseAnchor(list, from, to, baseWorld) {
  const Bp = list[to];
  const A = list[from];
  const bcx = Math.floor((Bp.x0 + Bp.x1) / 2);
  const bcz = Math.floor((Bp.z0 + Bp.z1) / 2);
  const acx = (A.x0 + A.x1 + 1) / 2;
  const acz = (A.z0 + A.z1 + 1) / 2;
  const ux = acx - (bcx + 0.5);
  const uz = acz - (bcz + 0.5);
  const ul = Math.hypot(ux, uz) || 1;
  const world = baseWorld || courseLite(list);
  for (const dy of [3, 4, 2, 5]) {
    for (const back of [1, 0, 2]) {
      const a = {
        x: Math.round(bcx + (ux / ul) * back), y: Bp.y + 1 + dy, z: Math.round(bcz + (uz / ul) * back),
      };
      // demir başka bir platformun içine/hemen üstüne gelmesin
      let clash = false;
      for (const q of list) {
        if (a.x >= q.x0 - 1 && a.x <= q.x1 + 1 && a.z >= q.z0 - 1 && a.z <= q.z1 + 1 && a.y >= q.y - 2 && a.y <= q.y + 3 && q !== Bp) clash = true;
      }
      if (clash) continue;
      const p0 = world.getBlock(a.x, a.y, a.z);
      const p1 = world.getBlock(a.x, a.y + 1, a.z);
      world.set(a.x, a.y, a.z, B.AMETHYST);
      world.set(a.x, a.y + 1, a.z, B.LIGHT_BLOCK);
      const r = simGrapple(world, list, from, to, a);
      world.set(a.x, a.y, a.z, p0);
      world.set(a.x, a.y + 1, a.z, p1);
      if (r.ok) return Object.assign({}, a, { start: r.start, strategy: r.strategy });
    }
  }
  return null;
}

/**
 * Planör kısayolu kanıtı: A'nın ortasından zıpla, tepe sonrası süzül (glide), hedefe doğru (ya da halka merkezlerine) yönel, B'ye
 * yaklaşınca süzülmeyi bırak. Hedef platformun içinde (kenardan ≥0,2) inip kalan bir denetleyici bulunursa kısayol kullanılabilirdir.
 * Planör ~9 b/s yatay hızla süzülür ve frenlenemez; küçük/kaygan hedefler (1×1 sütun, buz) bu yüzden uygun değildir.
 */
export function simGlide(world, list, from, to, rings) {
  const A = list[from];
  const Bp = list[to];
  const bcx = (Bp.x0 + Bp.x1 + 1) / 2;
  const bcz = (Bp.z0 + Bp.z1 + 1) / 2;
  const acx = (A.x0 + A.x1 + 1) / 2;
  const acz = (A.z0 + A.z1 + 1) / 2;
  const ab = { glide: true };
  const st = { mode: 'macera' };
  for (const aim of [0, 1]) {
    for (const gd of [0, 2, 4, 8]) {
      for (const stopD of [0, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14]) {
        const body = createPlayerBody(acx, A.y + 1, acz);
        for (let q = 0; q < 20; q++) stepPlayer(body, { yaw: 0 }, world, DT, ab, st);
        let jumped = false;
        let air = 0;
        const passed = new Set();
        for (let t = 0; t < 900; t++) {
          let tx = bcx;
          let tz = bcz;
          if (aim === 1) {
            for (let r = 0; r < rings.length; r++) if (!passed.has(r)) { tx = rings[r].x + 0.5; tz = rings[r].z + 0.5; break; }
          }
          const yaw = Math.atan2(-(tx - body.x), -(tz - body.z));
          const inp = {
            moveX: 0, moveZ: 1, yaw, sprint: true, glide: false, jump: false,
          };
          if (!jumped && body.onGround) { inp.jump = true; inp.jumpPressed = true; jumped = true; }
          const dB = Math.hypot(bcx - body.x, bcz - body.z);
          if (jumped && !body.onGround) {
            air++;
            if (air > gd && body.vy < 0 && dB > stopD) inp.glide = true;
            if (dB <= stopD + 1) inp.moveZ = 0.3;
          }
          stepPlayer(body, inp, world, DT, ab, st);
          for (let r = 0; r < rings.length; r++) if (Math.hypot(body.x - rings[r].x - 0.5, body.z - rings[r].z - 0.5) < 1.0) passed.add(r);
          if (body.y < Math.min(A.y, Bp.y) - 5) break;
          if (jumped && air > 3 && body.onGround) {
            const inside = body.x >= Bp.x0 + 0.2 && body.x <= Bp.x1 + 0.8 && body.z >= Bp.z0 + 0.2 && body.z <= Bp.z1 + 0.8;
            if (platIndexAt(list, body) === to && inside) return { ok: true, aim, glideDelay: gd, stopDist: stopD };
            break;
          }
        }
      }
    }
  }
  return { ok: false };
}
