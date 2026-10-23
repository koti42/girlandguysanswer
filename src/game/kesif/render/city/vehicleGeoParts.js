/*
 * KEŞİF render/city — ARAÇ PARÇALARI (SAF; vehicleGeoKit üzerinde): tekerlek, far, stop, ayna, plaka, koltuk, direksiyon, sürücü, egzoz.
 * Hepsi model uzayında yazılır (−Z ileri). `lod` 'hi' | 'lo': lo = trafik (≤600 üçgen) için yalın sürüm.
 */
import {
  Geo, SLOT, F_STEER, F_SPIN, F_DRIVER, F_INTERIOR, F_BIKE, lin,
} from './vehicleGeoKit.js';

export const C = Object.freeze({
  tyre: lin(0x14161b),
  rimDark: lin(0x2b303a),
  chrome: lin(0xc9d2dc),
  trim: lin(0x14171d),
  trimLight: lin(0x2c313b),
  arch: lin(0x050608),
  headW: lin(0xfff4d6),
  tail: lin(0xff2a2a),
  amber: lin(0xffa21c),
  white: lin(0xffffff),
  interior: lin(0x23262e),
  seat: lin(0x30343e),
  seatHi: lin(0x474c59),
  dash: lin(0x1b1e25),
  plate: lin(0xeef1f4),
  skin: [lin(0xf2c9a5), lin(0xd9a066), lin(0x9a6a43), lin(0x6e4630)],
  hair: [lin(0x2a1d14), lin(0x5a3a22), lin(0x16110e), lin(0xb8864a)],
  cloth: [lin(0x2f6bff), lin(0xe2476b), lin(0x1fb88a), lin(0xffb02e)],
  helmet: lin(0xe9edf2),
  visor: lin(0x0a1018),
  exhaust: lin(0x3a3f49),
});

/**
 * Tekerlek: (cx,cy,cz) merkez; side −1 sol / +1 sağ; hw yarı genişlik; seg kenar sayısı.
 * steer: ön tekerlek (F_STEER); iki yüz de görünür (motor) → both.
 */
export function addWheel(g, cx, cy, cz, r, hw, side, o) {
  const opt = o || {};
  const seg = opt.seg || 12;
  const flags = F_SPIN | (opt.steer ? F_STEER : 0) | (opt.flags || 0);
  g.with({ flags, pivot: [cx, cy, cz] }, () => {
    g.cylX(cx, cy, cz, r, hw, seg, {
      tread: { slot: SLOT.TYRE, col: C.tyre },
      capL: { slot: SLOT.TYRE, col: C.tyre },
      capR: { slot: SLOT.TYRE, col: C.tyre },
      caps: opt.both ? [true, true] : (side > 0 ? [false, true] : [true, false]),
      smooth: true,
    });
    // jant: dış yüze yakın disk (uv ile gölgelendirici kollu/halka desen çizer)
    const faces = opt.both ? [-1, 1] : [side];
    faces.forEach((s) => {
      const x = cx + s * (hw + 0.006);
      const rr = r * 0.66;
      const n = [s, 0, 0];
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const pa = [x, cy + Math.cos(a0) * rr, cz + Math.sin(a0) * rr];
        const pb = [x, cy + Math.cos(a1) * rr, cz + Math.sin(a1) * rr];
        const c = [x, cy, cz];
        const u = (p) => [0.5 + (p[2] - cz) / (2 * rr), 0.5 - (p[1] - cy) / (2 * rr)];
        if (s > 0) g.tri(c, pa, pb, n, n, n, { slot: SLOT.RIM, col: C.rimDark }, undefined, undefined, undefined, [0.5, 0.5], u(pa), u(pb));
        else g.tri(c, pb, pa, n, n, n, { slot: SLOT.RIM, col: C.rimDark }, undefined, undefined, undefined, [0.5, 0.5], u(pb), u(pa));
      }
    });
  });
}

/** Tekerlek yuvası (karanlık yarım disk) gövde yan yüzüne yakın: x düzlemi, merkez (cy,cz), yarıçap. side ±1. */
export function addArch(g, x, cy, cz, r, side, seg) {
  const n = [side, 0, 0];
  const s = seg || 8;
  for (let i = 0; i < s; i++) {
    const a0 = (i / s) * Math.PI;
    const a1 = ((i + 1) / s) * Math.PI;
    // üst yarım: açı 0 = +z, π = −z; y yukarı
    const pa = [x, cy + Math.sin(a0) * r, cz + Math.cos(a0) * r];
    const pb = [x, cy + Math.sin(a1) * r, cz + Math.cos(a1) * r];
    const c = [x, cy, cz];
    if (side > 0) g.tri(c, pb, pa, n, n, n, { slot: SLOT.ARCH, col: C.arch });
    else g.tri(c, pa, pb, n, n, n, { slot: SLOT.ARCH, col: C.arch });
  }
}

/** Far: eğik dikdörtgen (ön yüz). zf = ön z, merkez x, yükseklik y, genişlik w, yükseklik h. */
export function addHeadlamp(g, x, y, zf, w, h, sweep) {
  const sw = sweep || 0.06;
  g.with({ slot: SLOT.HEAD, col: C.headW, emit: 0.22 }, () => {
    g.quad([x - w, y - h, zf - sw], [x - w, y + h, zf], [x + w, y + h, zf], [x + w, y - h, zf - sw], { f: 'z-' });
  });
}

/** Stop lambası: arka yüzde şerit. */
export function addTaillamp(g, x, y, zb, w, h, sweep) {
  const sw = sweep || 0.05;
  g.with({ slot: SLOT.TAIL, col: C.tail, emit: 0.3 }, () => {
    g.quad([x + w, y - h, zb - sw], [x - w, y - h, zb - sw], [x - w, y + h, zb], [x + w, y + h, zb], { f: 'z+' });
  });
}

/** Küçük kare lamba (geri vites / sinyal): ön ya da arka. dir −1 ön, +1 arka. */
export function addLampDot(g, slot, col, x, y, z, w, h, dir) {
  g.with({ slot, col, emit: slot === SLOT.INDICATOR ? 0.1 : 0.06 }, () => {
    if (dir < 0) g.quad([x - w, y - h, z], [x - w, y + h, z], [x + w, y + h, z], [x + w, y - h, z], { f: 'z-' });
    else g.quad([x + w, y - h, z], [x - w, y - h, z], [x - w, y + h, z], [x + w, y + h, z], { f: 'z+' });
  });
}

/** Plaka: uv ile plaka atlasından okunur. dir −1 ön / +1 arka. */
export function addPlate(g, x, y, z, w, h, dir) {
  g.with({ slot: SLOT.PLATE, col: C.plate }, () => {
    if (dir < 0) g.quad([x - w, y - h, z], [x - w, y + h, z], [x + w, y + h, z], [x + w, y - h, z], { uv: [[1, 1], [1, 0], [0, 0], [0, 1]], f: 'z-' });
    else g.quad([x + w, y - h, z], [x - w, y - h, z], [x - w, y + h, z], [x + w, y + h, z], { uv: [[1, 1], [0, 1], [0, 0], [1, 0]], f: 'z+' });
  });
}

/** Yan ayna: kısa sap + küçük kutu. side ±1, x taban, y,z konum. */
export function addMirror(g, side, x, y, z) {
  g.with({ slot: SLOT.BODY, col: [1, 1, 1] }, () => {
    g.box(x - 0.02, y - 0.04, z - 0.06, x + side * 0.1, y + 0.04, z + 0.06);
  });
  g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
    g.box(x + side * 0.1, y - 0.07, z - 0.1, x + side * 0.16, y + 0.07, z + 0.1);
  });
}

/** Koltuk: taban + arkalık + baş desteği; (cx,cz) taban merkezi, y0 taban altı, rear = arkalık yönü (+z = arkada). */
export function addSeat(g, cx, y0, cz, w, o) {
  const opt = o || {};
  const hw = w / 2;
  g.with({ slot: SLOT.SEAT, col: opt.col || C.seat, flags: F_INTERIOR }, () => {
    g.box(cx - hw, y0, cz - 0.25, cx + hw, y0 + 0.16, cz + 0.2);
    g.taper(cz + 0.2, cz + 0.32, y0 + 0.1, y0 + 0.66, hw, hw * 0.95, hw, hw * 0.95);
  });
  if (!opt.noHead) {
    g.with({ slot: SLOT.SEAT, col: C.seatHi, flags: F_INTERIOR }, () => {
      g.box(cx - hw * 0.5, y0 + 0.66, cz + 0.24, cx + hw * 0.5, y0 + 0.82, cz + 0.32);
    });
  }
}

/** Direksiyon simidi: eğik halka (n kenar) + sütun. (cx,cy,cz) halka merkezi; tilt = öne eğim. */
export function addSteeringWheel(g, cx, cy, cz, r, n) {
  const seg = n || 10;
  const tilt = 0.5;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const w = 0.025;
  const pt = (a, rr, dz) => {
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    return [cx + px, cy + py * ct + dz * st, cz - py * st + dz * ct];
  };
  g.with({ slot: SLOT.TRIM, col: C.trim, flags: F_INTERIOR }, () => {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const o0 = pt(a0, r, 0);
      const o1 = pt(a1, r, 0);
      const i0 = pt(a0, r - 0.045, 0);
      const i1 = pt(a1, r - 0.045, 0);
      const up0 = [o0[0], o0[1] + w, o0[2]];
      const up1 = [o1[0], o1[1] + w, o1[2]];
      const nrm = [0, st, ct];
      g.triAuto(i0, o0, o1, nrm, nrm, nrm);
      g.triAuto(i0, o1, i1, nrm, nrm, nrm);
      const nB = [0, -st, -ct];
      g.triAuto(i0, o1, o0, nB, nB, nB);
      g.triAuto(i0, i1, o1, nB, nB, nB);
      void up0; void up1;
    }
  });
  g.with({ slot: SLOT.TRIM, col: C.trimLight, flags: F_INTERIOR }, () => {
    g.box(cx - 0.02, cy - r, cz - 0.02, cx + 0.02, cy, cz + 0.1);
  });
}

/** Gösterge paneli: ön camın altında, boydan boya eğimli blok. */
export function addDash(g, zFront, zBack, yLow, yHigh, halfW) {
  g.with({ slot: SLOT.INTERIOR, col: C.dash, flags: F_INTERIOR }, () => {
    g.taper(zFront, zBack, yLow, yHigh, halfW, halfW, halfW, halfW * 0.96);
  });
  // ekran ışığı (neon tonu kumaş yerine hafif yayma)
  g.with({ slot: SLOT.NEON, emit: -0.7, col: [0.15, 0.7, 0.9], flags: F_INTERIOR }, () => {
    g.quad([-0.18, yHigh + 0.003, zBack - 0.05], [-0.18, yHigh + 0.003, zBack - 0.22], [0.18, yHigh + 0.003, zBack - 0.22], [0.18, yHigh + 0.003, zBack - 0.05], { f: 'y+' });
  });
}

/**
 * Sürücü (oturan): (sx, sy, sz) kalça merkezi (koltuk üstü). Üslup: büyük yuvarlak kafa, kısa gövde;.
 * look: {skin 0..3, hair 0..3, cloth 0..3}; hairStyle 0..2 (kısa, kâkül, kep).
 */
export function addDriverSeated(g, sx, sy, sz, look, o) {
  const opt = o || {};
  const lk = look || {};
  const skin = C.skin[(lk.skin || 0) & 3];
  const hair = C.hair[(lk.hair || 0) & 3];
  const cloth = C.cloth[(lk.cloth || 0) & 3];
  const lean = opt.lean || 0.12;
  const hi = opt.detail !== 'lo';
  g.with({ flags: F_DRIVER | F_INTERIOR }, () => {
    // gövde (yukarı doğru hafif öne)
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      g.taper(sz - lean, sz + 0.12, sy, sy + 0.5, 0.2, 0.17, 0.22, 0.2);
    });
    // uyluklar
    g.with({ slot: SLOT.CLOTH, col: C.trimLight }, () => {
      g.box(sx - 0.17, sy - 0.02, sz - 0.5, sx - 0.02, sy + 0.12, sz + 0.1);
      g.box(sx + 0.02, sy - 0.02, sz - 0.5, sx + 0.17, sy + 0.12, sz + 0.1);
    });
    // kollar: omuzdan simide
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      g.box(sx - 0.27, sy + 0.32, sz - 0.34, sx - 0.2, sy + 0.45, sz + 0.02);
      g.box(sx + 0.2, sy + 0.32, sz - 0.34, sx + 0.27, sy + 0.45, sz + 0.02);
    });
    g.with({ slot: SLOT.SKIN, col: skin }, () => {
      g.box(sx - 0.27, sy + 0.34, sz - 0.42, sx - 0.2, sy + 0.4, sz - 0.34);
      g.box(sx + 0.2, sy + 0.34, sz - 0.42, sx + 0.27, sy + 0.4, sz - 0.34);
      g.box(sx - 0.05, sy + 0.5, sz - lean - 0.04, sx + 0.05, sy + 0.58, sz - lean + 0.04);
    });
    const hy = sy + 0.76;
    const hz = sz - lean - 0.03;
    g.with({ slot: SLOT.SKIN, col: skin }, () => {
      g.blob(sx, hy, hz, 0.15, 0.17, 0.15, hi ? 5 : 3, hi ? 8 : 6);
    });
    g.with({ slot: SLOT.HAIR, col: hair }, () => {
      g.blob(sx, hy + 0.045, hz + 0.025, 0.162, 0.15, 0.16, hi ? 3 : 2, hi ? 8 : 6);
    });
  });
}

/** Eğik gövde yardımcısı: kalçadan omuza eğimli prizma. */
function lean(g, sx, sy, sz, l, h, w0, w1) {
  g.hull(
    [[sx - w0, sy, sz - 0.04], [sx + w0, sy, sz - 0.04], [sx + w0, sy, sz + 0.18], [sx - w0, sy, sz + 0.18]],
    [[sx - w1, sy + h, sz - l - 0.07], [sx + w1, sy + h, sz - l - 0.07], [sx + w1, sy + h, sz - l + 0.13], [sx - w1, sy + h, sz - l + 0.13]],
  );
}

/**
 * Binici (motor / hoverbike): öne eğik, kasklı; kalça (sx,sy,sz) noktası. lean = omzun öne kayması. barZ = gidon z. Boyutlar normal insan ölçeğinde;
 * çağıran scaleSince ile küçültür (sevimli oranlar).
 */
export function addRiderCrouched(g, sx, sy, sz, look, lnv, barZ) {
  const lk = look || {};
  const cloth = C.cloth[(lk.cloth || 0) & 3];
  const l = lnv === undefined ? 0.42 : lnv;
  const bz = barZ === undefined ? sz - 0.78 : barZ;
  g.with({ flags: F_DRIVER | F_BIKE }, () => {
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      lean(g, sx, sy, sz, l, 0.54, 0.21, 0.29);
    });
    // kalça + bacaklar (dizler öne, tabanlar basamakta)
    g.with({ slot: SLOT.CLOTH, col: C.trimLight }, () => {
      g.box(sx - 0.19, sy - 0.1, sz - 0.04, sx + 0.19, sy + 0.1, sz + 0.2);
      g.sym(() => {
        g.hull(
          [[0.05, sy - 0.08, sz - 0.1], [0.19, sy - 0.08, sz - 0.1], [0.19, sy - 0.08, sz + 0.08], [0.05, sy - 0.08, sz + 0.08]],
          [[0.07, sy - 0.04, sz - 0.62], [0.19, sy - 0.04, sz - 0.62], [0.19, sy + 0.12, sz - 0.62], [0.07, sy + 0.12, sz - 0.62]],
        );
        g.box(0.08, sy - 0.62, sz - 0.62, 0.19, sy - 0.02, sz - 0.5);
      });
    });
    // kollar: omuzdan gidona
    const shy = sy + 0.46;
    const shz = sz - l;
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      g.sym(() => {
        g.hull(
          [[0.2, shy - 0.1, shz - 0.06], [0.34, shy - 0.1, shz - 0.06], [0.34, shy - 0.1, shz + 0.12], [0.2, shy - 0.1, shz + 0.12]],
          [[0.28, shy - 0.12, bz + 0.08], [0.38, shy - 0.12, bz + 0.08], [0.38, shy - 0.02, bz + 0.08], [0.28, shy - 0.02, bz + 0.08]],
        );
      });
    });
    g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
      g.sym(() => g.box(0.26, shy - 0.14, bz - 0.04, 0.38, shy - 0.02, bz + 0.1));
    });
    // kask
    const hy = sy + 0.52 + 0.14;
    const hz = shz - 0.02;
    g.with({ slot: SLOT.HELMET, col: C.helmet }, () => {
      g.blob(sx, hy, hz, 0.19, 0.2, 0.22, 5, 9);
    });
    g.with({ slot: SLOT.TRIM, col: C.visor }, () => {
      g.quad([sx - 0.15, hy - 0.05, hz - 0.2], [sx - 0.15, hy + 0.09, hz - 0.17], [sx + 0.15, hy + 0.09, hz - 0.17], [sx + 0.15, hy - 0.05, hz - 0.2], { f: 'z-' });
    });
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      g.box(sx - 0.07, sy + 0.5, shz - 0.02, sx + 0.07, sy + 0.62, shz + 0.08);
    });
  });
}

/** Ayakta duran binici (Süzülkay): hafif çömelmiş, kep + kapüşonlu. y0 = tahta üstü; bacaklar eklemli, kollar yanlarda. */
export function addRiderStanding(g, sx, y0, sz, look) {
  const lk = look || {};
  const skin = C.skin[(lk.skin || 0) & 3];
  const hair = C.hair[(lk.hair || 0) & 3];
  const cloth = C.cloth[(lk.cloth || 0) & 3];
  g.with({ flags: F_DRIVER | F_BIKE }, () => {
    // ayaklar: biri önde biri arkada (yan duruş)
    g.with({ slot: SLOT.TRIM, col: C.trim }, () => {
      g.box(sx - 0.12, y0, sz - 0.36, sx + 0.12, y0 + 0.1, sz - 0.1);
      g.box(sx - 0.12, y0, sz + 0.14, sx + 0.12, y0 + 0.1, sz + 0.4);
    });
    g.with({ slot: SLOT.CLOTH, col: C.trimLight }, () => {
      // bacaklar: ayaktan dize (hafif içe), dizden kalçaya
      g.hull(
        [[sx - 0.1, y0 + 0.1, sz - 0.34], [sx + 0.1, y0 + 0.1, sz - 0.34], [sx + 0.1, y0 + 0.1, sz - 0.14], [sx - 0.1, y0 + 0.1, sz - 0.14]],
        [[sx - 0.11, y0 + 0.5, sz - 0.22], [sx + 0.11, y0 + 0.5, sz - 0.22], [sx + 0.11, y0 + 0.5, sz - 0.02], [sx - 0.11, y0 + 0.5, sz - 0.02]],
      );
      g.hull(
        [[sx - 0.1, y0 + 0.1, sz + 0.16], [sx + 0.1, y0 + 0.1, sz + 0.16], [sx + 0.1, y0 + 0.1, sz + 0.38], [sx - 0.1, y0 + 0.1, sz + 0.38]],
        [[sx - 0.11, y0 + 0.5, sz + 0.02], [sx + 0.11, y0 + 0.5, sz + 0.02], [sx + 0.11, y0 + 0.5, sz + 0.2], [sx - 0.11, y0 + 0.5, sz + 0.2]],
      );
      g.box(sx - 0.2, y0 + 0.46, sz - 0.1, sx + 0.2, y0 + 0.66, sz + 0.12);
    });
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      g.taper(sz - 0.14, sz + 0.14, y0 + 0.64, y0 + 1.2, 0.2, 0.25, 0.2, 0.25);
      g.sym(() => g.hull(
        [[0.24, y0 + 1.1, sz - 0.07], [0.32, y0 + 1.1, sz - 0.07], [0.32, y0 + 1.1, sz + 0.07], [0.24, y0 + 1.1, sz + 0.07]],
        [[0.4, y0 + 0.74, sz - 0.14], [0.48, y0 + 0.74, sz - 0.14], [0.48, y0 + 0.74, sz + 0.06], [0.4, y0 + 0.74, sz + 0.06]],
      ));
    });
    g.with({ slot: SLOT.SKIN, col: skin }, () => {
      g.sym(() => g.box(0.4, y0 + 0.66, sz - 0.14, 0.5, y0 + 0.76, sz + 0.02));
      g.blob(sx, y0 + 1.38, sz - 0.02, 0.16, 0.18, 0.16, 5, 8);
    });
    g.with({ slot: SLOT.HAIR, col: hair }, () => {
      g.blob(sx, y0 + 1.42, sz, 0.17, 0.15, 0.17, 3, 8);
    });
    g.with({ slot: SLOT.CLOTH, col: cloth }, () => {
      g.box(sx - 0.1, y0 + 1.18, sz - 0.07, sx + 0.1, y0 + 1.28, sz + 0.07);
    });
  });
}

/** Egzoz borusu: arka alt köşelerde kısa silindir (X ekseninde çok yakın: küçük kutu). */
export function addExhaust(g, x, y, zb, r) {
  g.with({ slot: SLOT.EXHAUST, col: C.exhaust }, () => {
    g.box(x - r, y - r, zb - 0.02, x + r, y + r, zb + 0.12);
  });
}

export { Geo };
