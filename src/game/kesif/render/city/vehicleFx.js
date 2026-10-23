/*
 * KEŞİF render/city — ARAÇ IŞIK / DUMAN EFEKTLERİ (three). PointLight YOK: ışık bütçesi = toplamsal geometri.
 *
 *   createVehicleFx(THREE, shared, o?) → fx            shared = paylaşılan uniform nesneleri (G.materials.uniforms; yoksa varsayılan)
 *     fx.group                    THREE.Group (sahneye eklenir)
 *     fx.begin()                  kare başı sayaçları sıfırlar
 *     fx.pool(x,y,z, yaw, wid, len, rgb, a)          zemin ışık havuzu (far tabanı): (x,y,z) lamba hizası zemini, ileri = yaw yönü
 *     fx.flare(x,y,z, size, rgb, a)                  kameraya dönük parıltı (far/stop/sinyal)
 *     fx.under(x,y,z, yaw, wid, len, rgb, a, pattern)   araç altı zemin ışığı (underglow); pattern 0 sabit · 1 nefes · 2 dalga
 *     fx.streak(x,y,z, wid, len, rgb, a)             ıslak yolda lamba yansıma çizgisi (kameradan lambaya doğru uzar)
 *     fx.flame(x,y,z, dx,dy,dz, wid, len, rgb, a)    nitro alevi (eksen billboard; (dx,dy,dz) = alev yönü)
 *     fx.cone(x,y,z, dx,dy,dz, rad, len, rgb, a)     far konisi (tepe lamba, yön d)
 *     fx.puff(x,y,z, size, rgb, a)                   duman parçası (alfa karışımlı)
 *     fx.shadow(x,y,z, yaw, wid, len, a)             araç altı zemin gölgesi (alfa karışımlı yumuşak elips; aynı çizim çağrısı)
 *     fx.end()                    sayıları kesinler (kapasite aşımı sessizce atılır) ve GPU tamponlarını işaretler
 *     fx.setCaps({sprite, cone, smoke})   kademe: kapasite üst sınırı (ayrılan bellek değişmez); fx.stats {sprite, cone, smoke, draws, dropped}
 *     fx.setVisibleKinds({cone:bool, smoke:bool})   düşük kademede koni kapanır
 *     fx.dispose()
 *   createPuffPool(cap) → saf duman parçacık havuzu {spawn(x,y,z,vx,vy,vz,size,life,alpha), step(dt), each(fn), count}
 */
import {
  CONE_FRAGMENT, CONE_VERTEX, SMOKE_FRAGMENT, SMOKE_VERTEX, SPRITE_FRAGMENT, SPRITE_VERTEX,
} from './vehicleFxShaders.js';

export const FX_SPRITE_CAP = 224;
export const FX_CONE_CAP = 24;
export const FX_SMOKE_CAP = 112;
const SHARED_KEYS = ['uTime', 'uMotion', 'uSkyLight', 'uFogColor', 'uFogNear', 'uFogFar', 'uFadeStart', 'uFadeEnd', 'uWet', 'uNeon'];
const MODE_POOL = 0;
const MODE_FLARE = 1;
const MODE_UNDER = 2;
const MODE_STREAK = 3;
const MODE_FLAME = 4;

function instAttr(THREE, n, size) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  return a;
}

function mark(attr, count) {
  if (attr.clearUpdateRanges) attr.clearUpdateRanges();
  if (attr.addUpdateRange) attr.addUpdateRange(0, count * attr.itemSize);
  attr.needsUpdate = true;
}

function uniformsFor(THREE, shared) {
  const base = {
    uTime: { value: 0 }, uMotion: { value: 1 }, uSkyLight: { value: 1 }, uFogColor: { value: new THREE.Color(0.8, 0.9, 1) }, uFogNear: { value: 60 },
    uFogFar: { value: 150 }, uFadeStart: { value: 130 }, uFadeEnd: { value: 148 }, uWet: { value: 0 }, uNeon: { value: new THREE.Vector4(0, 0.45, 0, 0) },
  };
  const u = {};
  SHARED_KEYS.forEach((k) => { u[k] = shared && shared[k] ? shared[k] : base[k]; });
  return u;
}

/** Saf duman havuzu (konum/hız/ömür). Belirlenimli; tahsissiz adım. */
export function createPuffPool(cap) {
  const n = cap | 0;
  const d = {
    x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
    size: new Float32Array(n), life: new Float32Array(n), age: new Float32Array(n), alpha: new Float32Array(n), live: new Uint8Array(n),
  };
  let head = 0;
  const pool = {
    count: 0,
    cap: n,
    spawn(x, y, z, vx, vy, vz, size, life, alpha) {
      if (n === 0) return -1;
      const i = head;
      head = (head + 1) % n;
      d.x[i] = x; d.y[i] = y; d.z[i] = z; d.vx[i] = vx; d.vy[i] = vy; d.vz[i] = vz;
      d.size[i] = size; d.life[i] = life; d.age[i] = 0; d.alpha[i] = alpha; d.live[i] = 1;
      return i;
    },
    step(dt) {
      let c = 0;
      for (let i = 0; i < n; i++) {
        if (!d.live[i]) continue;
        d.age[i] += dt;
        if (d.age[i] >= d.life[i]) {
          d.live[i] = 0;
          continue;
        }
        const drag = Math.exp(-1.6 * dt);
        d.vx[i] *= drag; d.vz[i] *= drag; d.vy[i] = d.vy[i] * drag + 0.25 * dt;
        d.x[i] += d.vx[i] * dt; d.y[i] += d.vy[i] * dt; d.z[i] += d.vz[i] * dt;
        c++;
      }
      pool.count = c;
      return c;
    },
    each(fn) {
      for (let i = 0; i < n; i++) {
        if (!d.live[i]) continue;
        const k = d.age[i] / d.life[i];
        fn(d.x[i], d.y[i], d.z[i], d.size[i] * (0.6 + 1.1 * k), d.alpha[i] * (1 - k) * Math.min(1, k * 8), i);
      }
    },
    clear() {
      d.live.fill(0);
      pool.count = 0;
      head = 0;
    },
    data: d,
  };
  return pool;
}

export function createVehicleFx(THREE, shared, o) {
  const opt = o || {};
  const uni = uniformsFor(THREE, shared);
  const group = new THREE.Group();
  group.name = 'kesif-arac-fx';
  const caps = { sprite: FX_SPRITE_CAP, cone: FX_CONE_CAP, smoke: FX_SMOKE_CAP };
  const vis = { cone: true, smoke: true, sprite: true };
  const stats = {
    sprite: 0, cone: 0, smoke: 0, draws: 0, dropped: 0,
  };

  // sprite
  const sg = new THREE.PlaneGeometry(1, 1);
  const sFx = instAttr(THREE, FX_SPRITE_CAP, 4);
  sg.setAttribute('aFx', sFx);
  const sMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: SPRITE_VERTEX,
    fragmentShader: SPRITE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  sMat.name = 'kesif-arac-fx-sprite';
  const sMesh = new THREE.InstancedMesh(sg, sMat, FX_SPRITE_CAP);
  sMesh.name = 'arac-fx-sprite';
  sMesh.frustumCulled = false;
  sMesh.count = 0;
  sMesh.renderOrder = 20;
  sMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sMesh.instanceColor = instAttr(THREE, FX_SPRITE_CAP, 3);
  group.add(sMesh);

  // cone: tepe (0,0,0), taban halkası z = −1, yarıçap 1
  const SEG = 10;
  const cpos = [];
  const cnrm = [];
  const ct = [];
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2;
    const a1 = ((i + 1) / SEG) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const n0 = [Math.cos(am), Math.sin(am), 0.35];
    const l = Math.hypot(n0[0], n0[1], n0[2]);
    cpos.push(0, 0, 0, Math.cos(a0), Math.sin(a0), -1, Math.cos(a1), Math.sin(a1), -1);
    for (let k = 0; k < 3; k++) cnrm.push(n0[0] / l, n0[1] / l, n0[2] / l);
    ct.push(0, 1, 1);
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cpos), 3));
  cg.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(cnrm), 3));
  cg.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(ct), 1));
  const cFx = instAttr(THREE, FX_CONE_CAP, 4);
  cg.setAttribute('aFx', cFx);
  const cMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: CONE_VERTEX,
    fragmentShader: CONE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  cMat.name = 'kesif-arac-fx-koni';
  const cMesh = new THREE.InstancedMesh(cg, cMat, FX_CONE_CAP);
  cMesh.name = 'arac-fx-koni';
  cMesh.frustumCulled = false;
  cMesh.count = 0;
  cMesh.renderOrder = 21;
  cMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cMesh.instanceColor = instAttr(THREE, FX_CONE_CAP, 3);
  group.add(cMesh);

  // smoke
  const mg = new THREE.PlaneGeometry(1, 1);
  const mFx = instAttr(THREE, FX_SMOKE_CAP, 4);
  mg.setAttribute('aFx', mFx);
  const mMat = new THREE.ShaderMaterial({
    uniforms: uni,
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  mMat.name = 'kesif-arac-fx-duman';
  const mMesh = new THREE.InstancedMesh(mg, mMat, FX_SMOKE_CAP);
  mMesh.name = 'arac-fx-duman';
  mMesh.frustumCulled = false;
  mMesh.count = 0;
  mMesh.renderOrder = 22;
  mMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mMesh.instanceColor = instAttr(THREE, FX_SMOKE_CAP, 3);
  group.add(mMesh);

  let ns = 0;
  let nc = 0;
  let nm = 0;
  let dropped = 0;
  const sM = sMesh.instanceMatrix.array;
  const sC = sMesh.instanceColor.array;
  const sA = sFx.array;
  const cM = cMesh.instanceMatrix.array;
  const cC = cMesh.instanceColor.array;
  const cA = cFx.array;
  const mM = mMesh.instanceMatrix.array;
  const mC = mMesh.instanceColor.array;
  const mA = mFx.array;

  function writeYaw(M, i, x, y, z, yaw, sx, sy, sz) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const b = i * 16;
    M[b] = c * sx; M[b + 1] = 0; M[b + 2] = -s * sx; M[b + 3] = 0;
    M[b + 4] = 0; M[b + 5] = sy; M[b + 6] = 0; M[b + 7] = 0;
    M[b + 8] = s * sz; M[b + 9] = 0; M[b + 10] = c * sz; M[b + 11] = 0;
    M[b + 12] = x; M[b + 13] = y; M[b + 14] = z; M[b + 15] = 1;
  }

  /** Yön (dx,dy,dz) eksenli taban: yerel +Z = −d (koni −Z'ye bakar); sx,sy yanal ölçek, sz uzunluk. */
  function writeDir(M, i, x, y, z, dx, dy, dz, sx, sy, sz, flip) {
    let zx = flip ? dx : -dx;
    let zy = flip ? dy : -dy;
    let zz = flip ? dz : -dz;
    const zl = Math.hypot(zx, zy, zz) || 1;
    zx /= zl; zy /= zl; zz /= zl;
    // sağ = up × z
    let rx = zz;
    let ry = 0;
    let rz = -zx;
    let rl = Math.hypot(rx, ry, rz);
    if (rl < 1e-5) { rx = 1; ry = 0; rz = 0; rl = 1; }
    rx /= rl; ry /= rl; rz /= rl;
    const ux = zy * rz - zz * ry;
    const uy = zz * rx - zx * rz;
    const uz = zx * ry - zy * rx;
    const b = i * 16;
    M[b] = rx * sx; M[b + 1] = ry * sx; M[b + 2] = rz * sx; M[b + 3] = 0;
    M[b + 4] = ux * sy; M[b + 5] = uy * sy; M[b + 6] = uz * sy; M[b + 7] = 0;
    M[b + 8] = zx * sz; M[b + 9] = zy * sz; M[b + 10] = zz * sz; M[b + 11] = 0;
    M[b + 12] = x; M[b + 13] = y; M[b + 14] = z; M[b + 15] = 1;
  }

  function sprite(mode, x, y, z, yaw, w, l, rgb, a, p1, p2) {
    if (ns >= caps.sprite) { dropped++; return; }
    writeYaw(sM, ns, x, y, z, yaw, w, 1, l);
    sC[ns * 3] = rgb[0]; sC[ns * 3 + 1] = rgb[1]; sC[ns * 3 + 2] = rgb[2];
    sA[ns * 4] = mode; sA[ns * 4 + 1] = a; sA[ns * 4 + 2] = p1 || 0; sA[ns * 4 + 3] = p2 || 0;
    ns++;
  }

  const fx = {
    group,
    caps,
    stats,
    meshes: { sprite: sMesh, cone: cMesh, smoke: mMesh },
    materials: [sMat, cMat, mMat],
    begin() {
      ns = 0; nc = 0; nm = 0; dropped = 0;
    },
    pool(x, y, z, yaw, wid, len, rgb, a) {
      // havuz: (x,y,z) başlangıç (araca yakın uç); yerel +z ekseni yaw'ın "ileri" yönüne bakar: ileri = (−sin, −cos) → matris Z ekseni = (s,0,c) → yaw+π
      sprite(MODE_POOL, x, y, z, yaw + Math.PI, wid, len, rgb, a, 0, 0);
      // quad merkezini başlangıç ucundan len/2 ileri kaydır
      const b = (ns - 1) * 16;
      const fxw = -Math.sin(yaw);
      const fzw = -Math.cos(yaw);
      sM[b + 12] = x + fxw * len * 0.5;
      sM[b + 14] = z + fzw * len * 0.5;
    },
    flare(x, y, z, size, rgb, a) {
      sprite(MODE_FLARE, x, y, z, 0, size, 1, rgb, a, 0, 0);
    },
    under(x, y, z, yaw, wid, len, rgb, a, pattern) {
      sprite(MODE_UNDER, x, y, z, yaw, wid, len, rgb, a, pattern, 0);
    },
    streak(x, y, z, wid, len, rgb, a) {
      sprite(MODE_STREAK, x, y, z, 0, wid, len, rgb, a, 0, 0);
      const b = (ns - 1) * 16;
      // uzunluk ölçeği Z ekseninde (gölgelendirici length(zAxis) okur)
      sM[b + 8] = 0; sM[b + 9] = 0; sM[b + 10] = len;
    },
    flame(x, y, z, dx, dy, dz, wid, len, rgb, a) {
      if (ns >= caps.sprite) { dropped++; return; }
      writeDir(sM, ns, x + dx * len * 0.5, y + dy * len * 0.5, z + dz * len * 0.5, dx, dy, dz, wid, 1, len, true);
      sC[ns * 3] = rgb[0]; sC[ns * 3 + 1] = rgb[1]; sC[ns * 3 + 2] = rgb[2];
      sA[ns * 4] = MODE_FLAME; sA[ns * 4 + 1] = a; sA[ns * 4 + 2] = 0; sA[ns * 4 + 3] = ns * 0.37;
      ns++;
    },
    cone(x, y, z, dx, dy, dz, rad, len, rgb, a) {
      if (nc >= caps.cone) { dropped++; return; }
      writeDir(cM, nc, x, y, z, dx, dy, dz, rad, rad, len, false);
      cC[nc * 3] = rgb[0]; cC[nc * 3 + 1] = rgb[1]; cC[nc * 3 + 2] = rgb[2];
      cA[nc * 4] = 0; cA[nc * 4 + 1] = a; cA[nc * 4 + 2] = 0; cA[nc * 4 + 3] = 0;
      nc++;
    },
    puff(x, y, z, size, rgb, a) {
      if (nm >= caps.smoke) { dropped++; return; }
      writeYaw(mM, nm, x, y, z, 0, size, size, size);
      mC[nm * 3] = rgb[0]; mC[nm * 3 + 1] = rgb[1]; mC[nm * 3 + 2] = rgb[2];
      mA[nm * 4] = 0; mA[nm * 4 + 1] = a; mA[nm * 4 + 2] = 0; mA[nm * 4 + 3] = 0;
      nm++;
    },
    /** Zemin gölgesi (alfa karışımlı yumuşak elips): (x,y,z) merkez zemin, yaw uzun eksen yönü. Araç altı yer temas gölgesi. */
    shadow(x, y, z, yaw, wid, len, a) {
      if (nm >= caps.smoke) { dropped++; return; }
      writeYaw(mM, nm, x, y, z, yaw + Math.PI, wid, 1, len);
      mC[nm * 3] = 0; mC[nm * 3 + 1] = 0; mC[nm * 3 + 2] = 0;
      mA[nm * 4] = 1; mA[nm * 4 + 1] = a; mA[nm * 4 + 2] = 0; mA[nm * 4 + 3] = 0;
      nm++;
    },
    end() {
      const cn = vis.cone ? nc : 0;
      const mn = vis.smoke ? nm : 0;
      const sn = vis.sprite ? ns : 0;
      sMesh.count = sn; cMesh.count = cn; mMesh.count = mn;
      sMesh.visible = sn > 0; cMesh.visible = cn > 0; mMesh.visible = mn > 0;
      if (sn > 0) { mark(sMesh.instanceMatrix, sn); mark(sMesh.instanceColor, sn); mark(sFx, sn); }
      if (cn > 0) { mark(cMesh.instanceMatrix, cn); mark(cMesh.instanceColor, cn); mark(cFx, cn); }
      if (mn > 0) { mark(mMesh.instanceMatrix, mn); mark(mMesh.instanceColor, mn); mark(mFx, mn); }
      stats.sprite = sn; stats.cone = cn; stats.smoke = mn; stats.dropped = dropped;
      stats.draws = (sn > 0 ? 1 : 0) + (cn > 0 ? 1 : 0) + (mn > 0 ? 1 : 0);
    },
    setCaps(c) {
      if (c.sprite !== undefined) caps.sprite = Math.max(0, Math.min(FX_SPRITE_CAP, c.sprite | 0));
      if (c.cone !== undefined) caps.cone = Math.max(0, Math.min(FX_CONE_CAP, c.cone | 0));
      if (c.smoke !== undefined) caps.smoke = Math.max(0, Math.min(FX_SMOKE_CAP, c.smoke | 0));
    },
    setVisibleKinds(v) {
      if (v.cone !== undefined) vis.cone = !!v.cone;
      if (v.smoke !== undefined) vis.smoke = !!v.smoke;
      if (v.sprite !== undefined) vis.sprite = !!v.sprite;
    },
    dispose() {
      [sg, cg, mg].forEach((g) => g.dispose());
      [sMat, cMat, mMat].forEach((m) => m.dispose());
      [sMesh, cMesh, mMesh].forEach((m) => { if (m.dispose) m.dispose(); });
      group.clear();
    },
  };
  void opt;
  return fx;
}
