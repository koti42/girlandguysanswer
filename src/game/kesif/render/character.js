/*
 * KEŞİF oyun içi karakter: rafine, stilize-gerçekçi insansı (≈7 baş boy, 1.78 m).
 *
 * Tek iskeletli (26 kemik) SkinnedMesh; eklem bölgelerinde köşe ağırlıkları yumuşakça yayılır
 * (rijit-parça DEĞİL). Geometri characterBody/characterWear'da heykel gibi kurulur; dört ağ aynı
 * iskeleti paylaşır: body (ten+giysi, alt-yüzey parıltılı), hair, gloss (göz/dudak/deri ceket/metal),
 * glow (göz parıltısı, neon). Dinlenme pozunda tüm kemik dönüşleri 0'dır.
 *
 * Koordinatlar: 1 birim = 1 m, orijin ayak tabanı ortası, yüz -z'ye bakar (+x karakterin sağı).
 * root.rotation.y = gövde yönü (kamera yaw'ı ile aynı konvansiyon: +y sola döner).
 *
 * createCharacter(avatarConfig, {detail}) → {
 *   root, rig, setConfig(cfg), setHeld(itemKey), pose(name,t,opts), update(dt, motion) → state,
 *   setLight(level), dispose(), bounds, triangles, meshes, held }
 * motion: { speed, vy, onGround, crouch, swim, glide, grapple, dead, yaw, pitch, hurt (0..1 ilerleme),
 *           action:{name:'mine'|'attack'|'bow-draw'|'fire'|'place'|'cheer', progress?, charge?, kind?}, cheer }
 */
import * as THREE from 'three';
import { SkinBuilder } from './characterGeo.js';
import { BONES, PARENT, getLayout, makeContext, buildBody } from './characterBody.js';
import { buildWear } from './characterWear.js';
import {
  POSES, POSE_BONES, createPoseTarget, blendPose, dampK, wrapAngle, chooseLocomotion, gaitRate, applyNamedPose, resetPose,
  poseHurt,
} from './characterPoses.js';
import { createHeldItemModel, getHeldPlacement, disposeHeldItemModel, HAND_SOCKET } from './heldItems.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const EMPTY = {};

export { BONES, POSES };

/** Ten malzemesine alt-yüzey saçılımı görünümü ekler (kenarda sıcak, ışığa bakan yüzde hafif kızıllık). */
function patchSkinMaterial(mat) {
  const sss = new THREE.Color(1.0, 0.42, 0.3);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSssColor = { value: sss };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSkin;\nvarying float vSkin;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSkin;\nuniform vec3 uSssColor;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 sssV = normalize(vViewPosition);
          float sssRim = pow(1.0 - clamp(dot(normalize(normal), sssV), 0.0, 1.0), 2.4);
          outgoingLight += diffuseColor.rgb * uSssColor * vSkin * (0.045 + 0.42 * sssRim);
        }
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'kesif-skin-sss-1';
}

function createMaterials() {
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.64, metalness: 0 });
  patchSkinMaterial(body);
  const hair = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.0 });
  const gloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.0 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glow.color.setScalar(1.35);
  return { body, hair, gloss, glow };
}

export function createCharacter(avatarConfig, opts = {}) {
  const detail = opts.detail === 'low' ? 'low' : 'high';
  const root = new THREE.Group();
  root.name = 'kesifCharacter';

  /* ---- kemikler ---- */
  const bones = {};
  BONES.forEach((n) => {
    const b = new THREE.Bone();
    b.name = n;
    bones[n] = b;
  });
  BONES.forEach((n) => {
    const p = PARENT[n];
    if (p) bones[p].add(bones[n]);
  });
  root.add(bones.hips);

  const socketR = new THREE.Object3D();
  socketR.name = 'socketR';
  bones.handR.add(socketR);
  const socketL = new THREE.Object3D();
  socketL.name = 'socketL';
  bones.handL.add(socketL);
  const trailAnchor = new THREE.Object3D();
  trailAnchor.name = 'trailAnchor';
  bones.hips.add(trailAnchor);

  const rig = {
    ...bones,
    socketR, socketL, trailAnchor,
    rest: { hipsY: 0.92, thigh: 0.41, shin: 0.425, ankle: 0.085 },
  };

  const materials = createMaterials();
  const meshes = {};
  let skeleton = null;
  let triangles = 0;
  let current = '';
  let disposed = false;
  const bounds = { height: 1.78, radius: 0.3, eyeHeight: 1.62, box: new THREE.Box3() };
  let normalizedCfg = null;

  function dropMeshes() {
    Object.keys(meshes).forEach((k) => {
      const m = meshes[k];
      if (!m) return;
      root.remove(m);
      m.geometry.dispose();
      delete meshes[k];
    });
    if (skeleton) {
      skeleton.dispose();
      skeleton = null;
    }
  }

  function build(cfg) {
    const ctx = makeContext(cfg, detail);
    const key = JSON.stringify(ctx.cfg);
    if (key === current) return;
    current = key;
    normalizedCfg = ctx.cfg;
    const L = getLayout(ctx.cfg.body);
    BONES.forEach((n) => bones[n].position.fromArray(L.local[n]));
    rig.rest.hipsY = L.dims.hipY;
    rig.rest.thigh = L.dims.hipY - L.dims.kneeY;
    rig.rest.shin = L.dims.kneeY - L.dims.ankleY;
    rig.rest.ankle = L.dims.ankleY;
    trailAnchor.position.set(0, -(L.hipY - 0.2), 0.1);
    // el yuvaları: avuç içi (el kemiğinin aşağısı)
    socketR.position.fromArray(HAND_SOCKET.R);
    socketL.position.fromArray(HAND_SOCKET.L);

    const b = new SkinBuilder(BONES);
    buildBody(b, ctx);
    buildWear(b, ctx);
    const geo = b.build();

    dropMeshes();
    const inverses = BONES.map((n) => new THREE.Matrix4().makeTranslation(-L.world[n][0], -L.world[n][1], -L.world[n][2]));
    skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]), inverses);
    const identity = new THREE.Matrix4();
    const box = new THREE.Box3();
    ['body', 'hair', 'gloss', 'glow'].forEach((k) => {
      if (!geo[k]) return;
      const m = new THREE.SkinnedMesh(geo[k], materials[k]);
      m.name = 'character_' + k;
      m.bind(skeleton, identity);
      m.frustumCulled = false;
      m.castShadow = k !== 'glow';
      m.receiveShadow = k === 'body' || k === 'hair';
      root.add(m);
      meshes[k] = m;
      box.union(geo[k].boundingBox);
    });
    triangles = geo.triangles;
    bounds.box.copy(box);
    bounds.height = box.max.y - Math.min(0, box.min.y);
    bounds.radius = Math.max(box.max.x, -box.min.x, box.max.z, -box.min.z);
    bounds.eyeHeight = L.dims.eyeY - 0.008;
    target.rest = rig.rest;
    resetPose(rig);
  }

  /* ---- poz motoru ---- */
  const target = createPoseTarget(rig.rest);
  const loc = {};
  const params = { speed01: 0, vy01: 0, phase: 0, hold: 'none', progress: 0, charge: 0, kind: 'gun', pull: 0.5 };
  const state = {
    phase: 0, name: 'idle', speed: 0, grounded: true, step: false, foot: 0, landed: false, impact: 0,
    time: 0, bodyYaw: 0,
  };
  let lastStepN = 0;
  let wasGrounded = true;
  let lastVy = 0;
  let held = null;
  let holdKind = 'none';
  let heldKey = null;
  let skins = null; // Keşif mağaza görünümü kümesi (skins.resolveSkinSet); null = varsayılan
  let lightLevel = 1;

  build(avatarConfig);
  resetPose(rig);

  function setHeld(itemKey, force) {
    if (disposed) return;
    if (itemKey === heldKey && held && !force) return;
    if (held) {
      if (held.parent) held.parent.remove(held);
      disposeHeldItemModel(held);
      held = null;
    }
    heldKey = itemKey || null;
    holdKind = 'none';
    if (!itemKey) return;
    const model = createHeldItemModel(THREE, itemKey, undefined, skins);
    if (!model) return;
    const pl = getHeldPlacement(model, 'tp');
    (pl.hand === 'L' ? socketL : socketR).add(model);
    model.position.fromArray(pl.pos);
    model.quaternion.fromArray(pl.quat);
    model.scale.setScalar(pl.scale);
    held = model;
    holdKind = pl.hold || 'tool';
  }

  /** Adlandırılmış pozu rig'e DOĞRUDAN yazar (geçişsiz; önizleme/test). Bindirmeler mevcut pozun üstüne biner. */
  function pose(name, t = 0, o = EMPTY) {
    const p = { speed01: 0.5, hold: holdKind, ...o };
    applyNamedPose(rig, name, t, p);
    return rig;
  }

  function overlayParams(a) {
    params.progress = a.progress === undefined ? (state.time * 2.4) % 1 : a.progress;
    params.charge = a.charge === undefined ? 1 : a.charge;
    params.kind = a.kind || (a.name === 'fire' && holdKind === 'bow' ? 'bow' : 'gun');
  }

  function update(dt, motion) {
    const m = motion || EMPTY;
    if (disposed) return state;
    dt = clamp(dt, 0, 0.1);
    state.time += dt;
    const grounded = m.onGround !== false;
    const speed = Math.max(0, m.speed || 0);

    // taban poz ve adım fazı
    chooseLocomotion(m, loc);
    const gaitName = loc.name;
    let rate = 0;
    if (grounded && !m.swim && (gaitName === 'walk' || gaitName === 'run')) rate = gaitRate(speed);
    else if (gaitName === 'crouch') rate = gaitRate(Math.min(speed, 1.8)) * 0.9;
    else if (gaitName === 'swim') rate = 3 + loc.speed01 * 3;
    state.phase = (state.phase + rate * dt) % (TAU * 1000);
    params.phase = state.phase;
    params.speed01 = loc.speed01;
    params.vy01 = loc.vy01;
    params.hold = holdKind;
    params.progress = 0;
    state.name = gaitName;
    state.speed = speed;

    // ayak teması (ses için)
    state.step = false;
    if (rate > 0 && (gaitName === 'walk' || gaitName === 'run' || gaitName === 'crouch')) {
      const n = Math.floor((state.phase - Math.PI / 2) / Math.PI);
      if (n !== lastStepN) {
        state.step = true;
        state.foot = ((n % 2) + 2) % 2;
        lastStepN = n;
      }
    } else {
      lastStepN = Math.floor((state.phase - Math.PI / 2) / Math.PI);
    }
    state.landed = false;
    state.impact = 0;
    if (grounded && !wasGrounded) {
      state.landed = true;
      state.impact = clamp(-lastVy / 14, 0, 1);
    }
    wasGrounded = grounded;
    lastVy = m.vy || 0;
    state.grounded = grounded;

    // hedef poz
    const base = POSES[gaitName] || POSES.idle;
    if (m.cheer && gaitName === 'idle') POSES.cheer.fn(target, state.time, params);
    else base.fn(target, state.time, params);
    const a = m.action;
    if (a && a.name && POSES[a.name] && POSES[a.name].overlay && !m.dead) {
      overlayParams(a);
      POSES[a.name].fn(target, state.time, params);
    }
    if (m.hurt !== undefined && m.hurt !== null && !m.dead) {
      params.progress = clamp(m.hurt, 0, 1);
      poseHurt(target, state.time, params);
    }

    // gövde yönü ve bakış takibi
    const yaw = m.yaw === undefined ? state.bodyYaw : m.yaw;
    const pitch = clamp(m.pitch || 0, -1.5, 1.5);
    let diff = wrapAngle(yaw - state.bodyYaw);
    const busy = speed > 0.3 || !!a || m.glide || m.grapple;
    const limit = 1.0;
    if (Math.abs(diff) > limit) {
      state.bodyYaw = wrapAngle(state.bodyYaw + diff - Math.sign(diff) * limit);
      diff = wrapAngle(yaw - state.bodyYaw);
    }
    if (m.swim || m.dead) state.bodyYaw = wrapAngle(state.bodyYaw + diff * dampK(dt, 8));
    else if (busy) state.bodyYaw = wrapAngle(state.bodyYaw + diff * dampK(dt, 11));
    else if (Math.abs(diff) > 0.38) state.bodyYaw = wrapAngle(state.bodyYaw + diff * dampK(dt, 3.5));
    root.rotation.y = state.bodyYaw;
    const rel = wrapAngle(yaw - state.bodyYaw);
    if (!m.dead) {
      const lookW = m.swim ? 0.4 : 1;
      target.head.rotation.y += clamp(rel * 0.62, -0.85, 0.85) * lookW;
      target.neck.rotation.y += clamp(rel * 0.28, -0.4, 0.4) * lookW;
      target.chest.rotation.y += rel * 0.1 * lookW;
      target.head.rotation.x += clamp(pitch * 0.55, -0.7, 0.8) * lookW;
      target.neck.rotation.x += clamp(pitch * 0.25, -0.35, 0.4) * lookW;
    }

    // yaylı geçiş
    const fast = a || m.hurt !== undefined || loc.name === 'jump';
    blendPose(rig, target, dampK(dt, gaitName === 'death' ? 7 : fast ? 20 : 13));

    if (held && held.userData.bow) {
      let draw = 0;
      if (a && a.name === 'bow-draw') draw = a.charge === undefined ? 1 : a.charge;
      else if (a && a.name === 'fire') draw = Math.max(0, 1 - (a.progress || 0) * 6);
      held.userData.bow.setDraw(draw, draw > 0.02);
    }
    if (held && held.userData.update) held.userData.update(state.time, dt);
    return state;
  }

  function setLight(level) {
    lightLevel = clamp(level === undefined ? 1 : level, 0.1, 1.6);
    materials.body.color.setScalar(lightLevel);
    materials.hair.color.setScalar(lightLevel);
    materials.gloss.color.setScalar(lightLevel);
  }

  return {
    root,
    rig,
    bounds,
    setConfig(cfg) {
      if (disposed) return;
      build(cfg);
    },
    setHeld,
    /** Keşif görünümü kümesini değiştirir (null = varsayılan); elde tutulan eşya yeniden kurulur (yalnız görünüm kalıcı etkilenirse). */
    setSkins(set) {
      if (disposed) return;
      const next = set && set.key ? set : null;
      if ((next ? next.key : '') === (skins ? skins.key : '')) return;
      skins = next;
      if (heldKey) setHeld(heldKey, true);
    },
    pose,
    update,
    setLight,
    get light() { return lightLevel; },
    get config() { return normalizedCfg; },
    get triangles() { return triangles; },
    get meshes() { return Object.keys(meshes).map((k) => meshes[k]); },
    get held() { return held; },
    get state() { return state; },
    skinBones: POSE_BONES,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (held) {
        if (held.parent) held.parent.remove(held);
        disposeHeldItemModel(held);
        held = null;
      }
      dropMeshes();
      Object.keys(materials).forEach((k) => materials[k].dispose());
      if (root.parent) root.parent.remove(root);
    },
  };
}

