/*
 * KEŞİF sim/city — ÇATI PARKURU FİZİK KANITLARI (yalnız test/QA aracı; üretim yolu içe aktarmaz). physics.stepPlayer ile gerçek bloklar üzerinde:
 *   proveHop(world, A, B, o)          A çatısının merkezinden B çatısına betikli denetleyiciyle sıçrama (yürüyerek; o.sprint ile koşarak)
 *   proveGrapple(world, A, B, anchor) kanca: A'dan demir kristale nişan al, çekil, B çatısına in
 *   proveGlide(world, deck, o)        süzülme kulesi güvertesinden zıpla + süzül: hasarsız iniş (o.target: {x,z} yöneliş)
 * world: {getBlock(x,y,z)}; A/B: {x0,z0,x1,z1 (yarı açık parsel dikdörtgeni), y (ayak seviyesi), cx, cz (merkez hücre)}
 */
import { BLOCKS } from '../blocks.js';
import { createPlayerBody, stepPlayer } from '../physics.js';
import { createRayHit, raycastBlocks } from '../raycast.js';

const DT = 1 / 60;
const SOLID = new Uint8Array(256);
for (let id = 1; id < 255; id++) {
  const b = BLOCKS[id];
  SOLID[id] = b && b.collision && b.collision.length > 0 ? 1 : 0;
}

function supported(world, x, y, z) {
  return SOLID[world.getBlock(Math.floor(x), y - 1, Math.floor(z))] === 1;
}

function inFoot(R, x, z, pad) {
  const p = pad || 0;
  return x >= R.x0 + p && x < R.x1 - p && z >= R.z0 + p && z < R.z1 - p;
}

function landedOn(world, B, body) {
  return body.onGround && Math.abs(body.y - B.y) < 0.06 && inFoot(B, body.x, body.z, 0.25) && supported(world, body.x, B.y, body.z);
}

/** A merkezinden B merkezine: kenarda zıpla. Başarı: B çatısında ≥0,25 içeride durur (40 kare). */
export function proveHop(world, A, B, o) {
  const op = o || {};
  const sprints = op.sprint === undefined ? [false, true] : [!!op.sprint];
  const offs = [0, 0.12, 0.25];
  const aims = [0, 1];
  const st = { mode: 'macera' };
  for (const sprint of sprints) {
    for (const aim of aims) {
      for (const off of offs) {
        const sx = A.cx + 0.5;
        const sz = A.cz + 0.5;
        let tx = B.cx + 0.5;
        let tz = B.cz + 0.5;
        if (aim === 1) {
          // B'nin A'ya en yakın noktasından 1,2 içeri
          const nx = Math.min(Math.max(sx, B.x0 + 1.2), B.x1 - 1.2);
          const nz = Math.min(Math.max(sz, B.z0 + 1.2), B.z1 - 1.2);
          tx = nx;
          tz = nz;
        }
        let dx0 = tx - sx;
        let dz0 = tz - sz;
        if (op.axis) { // tohumlanmış yol: kenara dik, yanal koordinat = şerit/çıkıntı merkezi
          dx0 = op.axis === 'x' ? op.sgn : 0;
          dz0 = op.axis === 'z' ? op.sgn : 0;
        }
        const dl = Math.hypot(dx0, dz0) || 1;
        const dx = dx0 / dl;
        const dz = dz0 / dl;
        const body = createPlayerBody(sx, A.y, sz);
        let yaw = Math.atan2(-dx, -dz);
        for (let i = 0; i < 20; i++) stepPlayer(body, { yaw }, world, DT, {}, st);
        let lateral = !!op.axis;
        let jumped = false;
        let air = 0;
        let landed = -1;
        for (let i = 0; i < 420; i++) {
          const inp = {
            moveX: 0, moveZ: 1, yaw, sprint, jump: false, jumpPressed: false,
          };
          if (lateral) { // önce yanal koordinata yürü
            const cur = op.axis === 'x' ? body.z : body.x;
            const want = op.lat + 0.5;
            if (Math.abs(cur - want) < 0.12) {
              lateral = false;
              yaw = Math.atan2(-dx, -dz);
              inp.yaw = yaw;
            } else {
              const ldx = op.axis === 'x' ? 0 : Math.sign(want - cur);
              const ldz = op.axis === 'x' ? Math.sign(want - cur) : 0;
              inp.yaw = Math.atan2(-ldx, -ldz);
              inp.sprint = false;
              stepPlayer(body, inp, world, DT, {}, st);
              continue;
            }
          }
          const look = (sprint ? 0.34 : 0.28) - off;
          const ax = body.x + dx * look;
          const az = body.z + dz * look;
          if (!jumped && body.onGround && (!supported(world, ax, A.y, az) || ((body.hitX || body.hitZ) && i > 2))) {
            inp.jump = true;
            inp.jumpPressed = true;
            jumped = true;
          }
          if (jumped) air++;
          if (landed >= 0) {
            const sp = Math.hypot(body.vx, body.vz);
            inp.moveZ = sp > 0.4 ? -1 : 0;
            inp.sprint = false;
          }
          stepPlayer(body, inp, world, DT, {}, st);
          if (body.y < Math.min(A.y, B.y) - 3) break;
          if (jumped && body.onGround && landed < 0 && air > 3) {
            if (!landedOn(world, B, body)) {
              jumped = false; // basamak/duvar önünde zıpladı ama B'ye inmedi: yürüyüşe devam (aynı yönde)
              air = 0;
              if (!inFoot(B, body.x, body.z, -0.1)) break;
            } else landed = i;
          }
          if (!jumped && landed < 0 && landedOn(world, B, body)) landed = i;
          if (landed >= 0 && i - landed > 40) return landedOn(world, B, body) ? { ok: true, sprint, aim, off, ticks: i } : { ok: false };
        }
      }
    }
  }
  return { ok: false };
}

/** Kanca: A merkezinden demir kristale (anchor hücresi) nişan; çekil; B çatısına in (steer/brake/none stratejileri). */
export function proveGrapple(world, A, B, anchor) {
  const ab = { grapple: true };
  const st = { mode: 'macera' };
  // başlangıç: A'nın B'ye bakan kenarından 1,5 içeride (kanca kısayolu boşluğu atlamak içindir)
  const nx = Math.min(Math.max(B.cx + 0.5, A.x0 + 1.5), A.x1 - 1.5);
  const nz = Math.min(Math.max(B.cz + 0.5, A.z0 + 1.5), A.z1 - 1.5);
  const starts = [[nx, nz], [A.cx + 0.5, A.cz + 0.5]];
  for (const fx of [0.35, 0.65]) for (const fz of [0.35, 0.65]) starts.push([A.x0 + fx * (A.x1 - A.x0), A.z0 + fz * (A.z1 - A.z0)]);
  for (const [sx, sz] of starts) {
    for (const strategy of ['none', 'brake', 'steer']) {
      const body = createPlayerBody(sx, A.y, sz);
      for (let q = 0; q < 20; q++) stepPlayer(body, { yaw: 0 }, world, DT, ab, st);
      const eye = { x: body.x, y: body.y + body.eyeH, z: body.z };
      const dx = anchor.x + 0.5 - eye.x;
      const dy = anchor.y + 0.5 - eye.y;
      const dz = anchor.z + 0.5 - eye.z;
      const dd = Math.hypot(dx, dy, dz);
      if (dd > 26) break;
      const hit = raycastBlocks(world, eye, { x: dx / dd, y: dy / dd, z: dz / dd }, 28, { solidOnly: true, out: createRayHit() });
      if (!hit || hit.x !== anchor.x || hit.y !== anchor.y || hit.z !== anchor.z) break;
      const tgt = { x: hit.point.x, y: hit.point.y, z: hit.point.z };
      const yaw = Math.atan2(-(tgt.x - body.x), -(tgt.z - body.z));
      let ended = false;
      for (let t = 0; t < 400; t++) {
        const inp = { moveX: 0, moveZ: 0, yaw, sprint: false, jump: false };
        if (t === 0) inp.grapple = tgt;
        if (!body.grapple.active && t > 3) {
          ended = true;
          const sp = Math.hypot(body.vx, body.vz);
          if (strategy === 'brake' && sp > 0.5) {
            const bx = -body.vx / sp;
            const bz = -body.vz / sp;
            inp.moveX = bx * Math.cos(yaw) + bz * -Math.sin(yaw);
            inp.moveZ = bx * -Math.sin(yaw) + bz * -Math.cos(yaw);
          } else if (strategy === 'steer') {
            const ex = B.cx + 0.5 - body.x;
            const ez = B.cz + 0.5 - body.z;
            const m = Math.hypot(ex, ez) || 1;
            inp.moveX = (ex / m) * Math.cos(yaw) + (ez / m) * -Math.sin(yaw);
            inp.moveZ = (ex / m) * -Math.sin(yaw) + (ez / m) * -Math.cos(yaw);
          }
        }
        stepPlayer(body, inp, world, DT, ab, st);
        if (body.y < Math.min(A.y, B.y) - 4) break;
        if (ended && body.onGround && !body.grapple.active) {
          for (let k = 0; k < 90; k++) {
            const sp = Math.hypot(body.vx, body.vz);
            const bi = sp < 0.5 ? { moveX: 0, moveZ: 0 } : { moveX: (-body.vx / sp) * Math.cos(yaw) + (-body.vz / sp) * -Math.sin(yaw), moveZ: (-body.vx / sp) * -Math.sin(yaw) + (-body.vz / sp) * -Math.cos(yaw) };
            stepPlayer(body, { moveX: bi.moveX, moveZ: bi.moveZ, yaw }, world, DT, ab, st);
            if (body.y < B.y - 1) break;
          }
          if (landedOn(world, B, body)) return { ok: true, strategy, start: [sx, sz] };
          break;
        }
      }
    }
  }
  return { ok: false };
}

/**
 * Süzülme kulesi güvertesi (deck {x,y,z} ayak merkezi): doğuya (+x, açık yüz) yürü, zıpla, düşerken planörü aç, o.target'a yönel.
 * Başarı: yere (onGround) hasarsız iner (düşme olayı yok) ve hedefe ≤ o.within blok yaklaşır ya da herhangi sağlam zemine hasarsız iner.
 */
export function proveGlide(world, deck, o) {
  const op = o || {};
  const ab = { glide: true };
  const st = { mode: 'macera' };
  const body = createPlayerBody(deck.x, deck.y, deck.z);
  const tgt = op.target || { x: deck.x + 30, z: deck.z };
  for (let q = 0; q < 20; q++) stepPlayer(body, { yaw: -Math.PI / 2 }, world, DT, ab, st);
  let jumped = false;
  let minDist = 1e9;
  let damage = 0;
  let landed = false;
  for (let t = 0; t < 2400; t++) {
    const yaw = Math.atan2(-(tgt.x - body.x), -(tgt.z - body.z));
    const inp = { moveX: 0, moveZ: 1, yaw: jumped ? yaw : -Math.PI / 2, sprint: true, glide: false, jump: false, jumpPressed: false };
    if (!jumped && body.onGround && t > 5 && !supported(world, body.x + 0.34, deck.y, body.z)) {
      inp.jump = true;
      inp.jumpPressed = true;
      jumped = true;
    }
    if (jumped && !body.onGround && body.vy < 0) inp.glide = true;
    const ev = stepPlayer(body, inp, world, DT, ab, st);
    for (let k = 0; k < ev.length; k++) if (ev[k].type === 'fall') damage += ev[k].damage || 0;
    const d = Math.hypot(tgt.x - body.x, tgt.z - body.z);
    if (d < minDist) minDist = d;
    if (jumped && body.onGround && t > 30) {
      landed = true;
      break;
    }
    if (body.y < -20) break;
  }
  return { ok: landed && damage === 0, landed, damage, minDist, x: body.x, y: body.y, z: body.z };
}
