/*
 * KEŞİF sim/city/mission — GÖREV KOŞUCUSU (sıralı adımlar). SAF, belirlenimci, tahsis-hafif, es2020. Kurye/taksi/kapsül/tamir işleri, yarışlar ve hikâye görevlerinin
 * ortak çekirdeği: sıralı adımlar, süre sınırı, en kısa süre (hile), iptal, başarısızlık/yeniden deneme, kayıt anlık görüntüsü. SOFT-LOCK YOK: `cancel()` her an
 * geçerlidir; koşucu hiçbir zaman dış durum beklemez (olay adımları yalnız `notify` ile ilerler, süresi dolunca ya da iptalde biter).
 *
 *   createRun(def, opts?) → Run         def {id, kind, title, steps[], limit=0, minTime=0, cls=null, noTeleport=false, fragile=false, laps=1, meta}
 *       opts {radiusScale=1 (erişilebilirlik ×2), timeScale=1 (süre sınırı çarpanı)}
 *   Adım türleri (hepsi {id?, type, label, …}):
 *     goto   {x,y,z,r, dy=6, mode:'any'|'vehicle'|'foot', maxSpeed?}        hedefe yaklaş (maxSpeed verilirse o hızın altında dur)
 *     gates  {gates:[{x,y,z,r}], laps=1}                                    sıralı kapılar; parça-doğru geçiş (hızlı araç kapıyı atlayamaz)
 *     hold   {x,y,z,r, seconds, mode}                                       yarıçap içinde saniye boyu kal (çıkarsa sayaç sıfırlanır)
 *     wait   {seconds}                                                      bekle
 *     event  {until:'ad', n=1}                                              `run.notify('ad')` n kez gelene dek
 *   run.start() · run.update(dt, ctx) → events[] (paylaşılan dizi; sonraki update'e dek geçerli) · run.notify(name, data?) → events[] · run.cancel(reason) · run.fail(reason)
 *   run.retry() · run.view(out?) · run.snapshot() · restoreRun(def, snap, opts) · run.status · run.t · run.step · run.result
 *   ctx {x,y,z, speed=0, cls=null, dt?}.   Olaylar: {type:'start'|'step'|'gate'|'done'|'failed'|'cancelled'|'warn', …}
 *   FAIL: 'sure_doldu' 'ışınlanma' 'arac_degisti' 'sure_gecersiz' 'kirildi' 'iptal' 'arac_yok' 'olum'
 */
export const RUN_STATUS = Object.freeze({
  READY: 'ready', ACTIVE: 'active', DONE: 'done', FAILED: 'failed', CANCELLED: 'cancelled',
});
export const FAIL_TEXT = Object.freeze({
  sure_doldu: 'Süre doldu.',
  ışınlanma: 'Işınlandığın için görev iptal oldu.',
  arac_degisti: 'Araç değiştiği için görev iptal oldu.',
  sure_gecersiz: 'Süre geçersiz sayıldı.',
  kirildi: 'Kırılgan paket zarar gördü.',
  iptal: 'Görevi bıraktın.',
  arac_yok: 'Araçtan indin; görev bitti.',
  olum: 'Görev yarıda kaldı.',
});

const MAX_STEPS = 64;
const MAX_CHAIN = 4;
const FRAGILE_IMPACT = 6;
export const JUMP_SPEED = 80;
export const JUMP_PAD = 6;
const EV = [];

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

function stepOk(s) {
  if (!s || typeof s !== 'object') return false;
  switch (s.type) {
    case 'goto':
    case 'hold':
      return fin(s.x) && fin(s.z) && fin(s.r) && s.r > 0;
    case 'gates':
      return Array.isArray(s.gates) && s.gates.length > 0 && s.gates.every((g) => g && fin(g.x) && fin(g.z) && fin(g.r) && g.r > 0);
    case 'wait':
      return fin(s.seconds) && s.seconds >= 0;
    case 'event':
      return typeof s.until === 'string' && s.until.length > 0;
    default:
      return false;
  }
}

/** Tanım doğrulaması → null | hata metni (test/üretici denetimi). */
export function validateDef(def) {
  if (!def || typeof def !== 'object') return 'tanım yok';
  if (typeof def.id !== 'string' || !/^[a-z0-9_.:]{1,40}$/.test(def.id)) return 'kimlik geçersiz';
  if (!Array.isArray(def.steps) || def.steps.length === 0 || def.steps.length > MAX_STEPS) return 'adım sayısı geçersiz';
  for (let i = 0; i < def.steps.length; i++) if (!stepOk(def.steps[i])) return 'adım ' + i + ' geçersiz';
  if (def.limit !== undefined && (!fin(def.limit) || def.limit < 0)) return 'limit geçersiz';
  if (def.minTime !== undefined && (!fin(def.minTime) || def.minTime < 0)) return 'minTime geçersiz';
  return null;
}

/** Parça (a→b) ile daire (cx,cz,r) kesişiyor mu (XZ)? */
export function segCircle(ax, az, bx, bz, cx, cz, r) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = 0;
  if (l2 > 1e-9) {
    t = ((cx - ax) * dx + (cz - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const px = ax + dx * t - cx;
  const pz = az + dz * t - cz;
  return px * px + pz * pz <= r * r;
}

export function createRun(def, optsIn) {
  const bad = validateDef(def);
  if (bad) throw new Error('createRun: ' + bad);
  const o = optsIn || {};
  const rs = fin(o.radiusScale) && o.radiusScale > 0 ? o.radiusScale : 1;
  const ts = fin(o.timeScale) && o.timeScale > 0 ? o.timeScale : 1;
  const limit = (def.limit || 0) * ts;
  const R = {
    def,
    status: RUN_STATUS.READY,
    t: 0,
    step: 0,
    gate: 0,
    lap: 0,
    passed: 0,
    total: 0,
    held: 0,
    count: 0,
    attempts: 1,
    bumps: 0,
    reason: '',
    result: null,
    limit,
    radiusScale: rs,
    px: 0,
    pz: 0,
    hasPrev: false,
    cls: def.cls || null,
    dist: 0,
    tx: 0,
    tz: 0,
    ty: 0,
    tr: 0,
  };

  function gatesTotal(s) {
    return s.gates.length * Math.max(1, s.laps | 0 || 1);
  }

  function enter(i) {
    R.step = i;
    R.gate = 0;
    R.lap = 0;
    R.held = 0;
    R.count = 0;
    const s = def.steps[i];
    if (s && s.type === 'gates') {
      R.passed = 0;
      R.total = gatesTotal(s);
    }
  }

  function finish(status, reason, events) {
    R.status = status;
    R.reason = reason || '';
    R.result = { status, reason: R.reason, time: R.t, bumps: R.bumps, attempts: R.attempts, steps: R.step };
    events.push({
      type: status === RUN_STATUS.DONE ? 'done' : status === RUN_STATUS.FAILED ? 'failed' : 'cancelled', reason: R.reason, time: R.t,
    });
    return events;
  }

  function complete(events) {
    if (def.minTime > 0 && R.t < def.minTime) return finish(RUN_STATUS.FAILED, 'sure_gecersiz', events);
    return finish(RUN_STATUS.DONE, '', events);
  }

  function advance(events) {
    const next = R.step + 1;
    events.push({ type: 'step', index: R.step, next });
    if (next >= def.steps.length) {
      complete(events);
      return false;
    }
    enter(next);
    return true;
  }

  function inside(s, ctx, r) {
    const dx = ctx.x - s.x;
    const dz = ctx.z - s.z;
    if (dx * dx + dz * dz > r * r) return false;
    const dy = fin(s.dy) ? s.dy : 6;
    return !fin(s.y) || !fin(ctx.y) || Math.abs(ctx.y - s.y) <= dy;
  }

  function modeOk(s, ctx) {
    if (s.mode === 'vehicle') return !!ctx.cls;
    if (s.mode === 'foot') return !ctx.cls;
    return true;
  }

  function update(dt, ctx) {
    const ev = EV;
    ev.length = 0;
    if (R.status !== RUN_STATUS.ACTIVE || !ctx || !fin(ctx.x) || !fin(ctx.z)) return ev;
    const step = dt > 0 && dt < 5 ? dt : 0;
    R.t += step;
    // ışınlanma / araç değişimi
    if (R.hasPrev && def.noTeleport) {
      const jd = Math.hypot(ctx.x - R.px, ctx.z - R.pz);
      if (jd > JUMP_SPEED * Math.max(step, 1 / 60) + JUMP_PAD) {
        finish(RUN_STATUS.CANCELLED, 'ışınlanma', ev);
        return ev;
      }
    }
    if (def.cls && (ctx.cls || null) !== def.cls) {
      finish(RUN_STATUS.CANCELLED, 'arac_degisti', ev);
      return ev;
    }
    if (limit > 0 && R.t >= limit) {
      finish(RUN_STATUS.FAILED, 'sure_doldu', ev);
      return ev;
    }
    const speed = fin(ctx.speed) ? ctx.speed : 0;
    for (let chain = 0; chain < MAX_CHAIN && R.status === RUN_STATUS.ACTIVE; chain++) {
      const s = def.steps[R.step];
      let moved = false;
      if (s.type === 'goto') {
        R.tx = s.x; R.ty = s.y; R.tz = s.z; R.tr = s.r * R.radiusScale;
        if (modeOk(s, ctx) && inside(s, ctx, R.tr) && (!fin(s.maxSpeed) || speed <= s.maxSpeed)) moved = advance(ev);
      } else if (s.type === 'hold') {
        R.tx = s.x; R.ty = s.y; R.tz = s.z; R.tr = s.r * R.radiusScale;
        if (modeOk(s, ctx) && inside(s, ctx, R.tr)) {
          R.held += step;
          if (R.held >= (s.seconds || 0)) moved = advance(ev);
        } else R.held = 0;
      } else if (s.type === 'wait') {
        R.held += step;
        if (R.held >= s.seconds) moved = advance(ev);
      } else if (s.type === 'gates') {
        const gs = s.gates;
        const g = gs[R.gate];
        R.tx = g.x; R.ty = g.y; R.tz = g.z; R.tr = g.r * R.radiusScale;
        const ax = R.hasPrev ? R.px : ctx.x;
        const az = R.hasPrev ? R.pz : ctx.z;
        const near = !fin(g.y) || !fin(ctx.y) || Math.abs(ctx.y - g.y) < (fin(g.dy) ? g.dy : 8);
        if (near && segCircle(ax, az, ctx.x, ctx.z, g.x, g.z, R.tr)) {
          R.passed++;
          R.gate++;
          ev.push({
            type: 'gate', index: R.passed - 1, passed: R.passed, total: R.total, lap: R.lap, t: R.t,
          });
          if (R.gate >= gs.length) {
            R.gate = 0;
            R.lap++;
          }
          if (R.passed >= R.total) moved = advance(ev);
          else break;
        }
      }
      if (!moved) break;
    }
    R.px = ctx.x;
    R.pz = ctx.z;
    R.hasPrev = true;
    // hedefe uzaklık (HUD)
    R.dist = Math.hypot(R.tx - ctx.x, R.tz - ctx.z);
    return ev;
  }

  function notify(name, data) {
    const ev = EV;
    ev.length = 0;
    if (R.status !== RUN_STATUS.ACTIVE) return ev;
    if (name === 'bump') {
      R.bumps++;
      const imp = data && fin(data.impact) ? data.impact : 0;
      if (def.fragile && imp > FRAGILE_IMPACT) finish(RUN_STATUS.FAILED, 'kirildi', ev);
      return ev;
    }
    const s = def.steps[R.step];
    if (s && s.type === 'event' && s.until === name) {
      R.count += data && fin(data.n) && data.n > 0 ? Math.floor(data.n) : 1;
      if (R.count >= (s.n || 1)) advance(ev);
    }
    return ev;
  }

  function start() {
    R.status = RUN_STATUS.ACTIVE;
    R.t = 0;
    R.hasPrev = false;
    R.result = null;
    R.reason = '';
    R.bumps = 0;
    enter(0);
    EV.length = 0;
    EV.push({ type: 'start' });
    return EV;
  }

  function cancel(reason) {
    const ev = EV;
    ev.length = 0;
    if (R.status !== RUN_STATUS.ACTIVE && R.status !== RUN_STATUS.READY) return ev;
    finish(RUN_STATUS.CANCELLED, typeof reason === 'string' && reason ? reason : 'iptal', ev);
    return ev;
  }

  function failRun(reason) {
    const ev = EV;
    ev.length = 0;
    if (R.status !== RUN_STATUS.ACTIVE) return ev;
    finish(RUN_STATUS.FAILED, reason || 'olum', ev);
    return ev;
  }

  function retry() {
    R.attempts++;
    start();
    return R.status === RUN_STATUS.ACTIVE;
  }

  /** HUD görünümü (nesne yeniden kullanılır). */
  function view(out) {
    const v = out || {};
    const s = def.steps[Math.min(R.step, def.steps.length - 1)];
    v.id = def.id;
    v.kind = def.kind;
    v.title = def.title;
    v.label = s.label || '';
    v.step = R.step;
    v.steps = def.steps.length;
    v.dist = Math.round(R.dist);
    v.timeLeft = limit > 0 ? Math.max(0, Math.ceil(limit - R.t)) : -1;
    v.t = R.t;
    v.target = s.type === 'wait' || s.type === 'event' ? null : { x: R.tx, y: R.ty, z: R.tz, r: R.tr };
    v.gate = R.passed;
    v.gates = R.total;
    v.status = R.status;
    return v;
  }

  function snapshot() {
    return {
      id: def.id, s: R.step, g: R.gate, l: R.lap, p: R.passed, t: Math.round(R.t * 10) / 10, h: Math.round(R.held * 10) / 10, c: R.count, a: R.attempts, b: R.bumps,
    };
  }

  function restore(snap) {
    if (!snap || typeof snap !== 'object' || snap.id !== def.id) return false;
    const si = Number.isInteger(snap.s) && snap.s >= 0 && snap.s < def.steps.length ? snap.s : 0;
    R.status = RUN_STATUS.ACTIVE;
    enter(si);
    const s = def.steps[si];
    R.t = fin(snap.t) && snap.t >= 0 ? snap.t : 0;
    R.held = fin(snap.h) && snap.h >= 0 ? snap.h : 0;
    R.count = Number.isInteger(snap.c) && snap.c >= 0 ? snap.c : 0;
    R.attempts = Number.isInteger(snap.a) && snap.a >= 1 ? snap.a : 1;
    R.bumps = Number.isInteger(snap.b) && snap.b >= 0 ? snap.b : 0;
    if (s.type === 'gates') {
      const tot = gatesTotal(s);
      const p = Number.isInteger(snap.p) && snap.p >= 0 && snap.p < tot ? snap.p : 0;
      R.passed = p;
      R.gate = p % s.gates.length;
      R.lap = Math.floor(p / s.gates.length);
    }
    R.hasPrev = false;
    return true;
  }

  Object.assign(R, {
    start, update, notify, cancel, fail: failRun, retry, view, snapshot, restore, gatesTotal,
  });
  return R;
}

export function restoreRun(def, snap, opts) {
  const r = createRun(def, opts);
  return r.restore(snap) ? r : null;
}

/* ------------------------------------------------------------------------------------------------
 * Adım kurucuları (üreticiler ve testler için)
 * ---------------------------------------------------------------------------------------------- */
export function gotoStep(label, p, r, extra) {
  return Object.assign({
    type: 'goto', label, x: p.x, y: p.y, z: p.z, r,
  }, extra || null);
}

export function gatesStep(label, gates, laps) {
  return {
    type: 'gates', label, gates, laps: laps || 1,
  };
}

export function eventStep(label, until, n) {
  return {
    type: 'event', label, until, n: n || 1,
  };
}

export function waitStep(label, seconds) {
  return { type: 'wait', label, seconds };
}

export function holdStep(label, p, r, seconds, extra) {
  return Object.assign({
    type: 'hold', label, x: p.x, y: p.y, z: p.z, r, seconds,
  }, extra || null);
}
