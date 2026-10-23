/*
 * KEŞİF ses — DÜĞÜM TAKİPÇİSİ (Neon Meridyen Faz 3, vehicle_audio). audioVehicle.js ve audioRadio.js ortak kullanır; WebAudio nesnelerini
 * "grup" (ses/ses kümesi) halinde kurar, KAYNAK düğümlerini (osilatör + tampon kaynağı) sayar ve katı bir tavan uygular; her grup bırakılırken
 * tüm düğümler durdurulur + bağlantısı kesilir (sızıntı yok).
 *
 *   const kit = createNodeKit({ cap })
 *   kit.setContext(ctx)                  bağlam değiştiyse tüm gruplar atılır
 *   kit.canTake(n)                       cap - sayaç ≥ n mi (kaynak düğümü)
 *   const g = kit.group(label)           g.gain(v) g.filter(type,f,q) g.osc(type,f) g.noise(buf) g.stereo() g.connect(a,b)
 *   g.finish(endT)                       tek atımlık: kaynaklar endT'de durur
 *   g.dispose(fadeSec)                   zarif bırakma (sönümle, durdur; bağlantılar bitince kesilir)    g.destroy()  anında
 *   kit.sweep(now)                       süresi dolan grupları temizler (her karede çağır)   kit.destroyAll()   hepsi anında
 *   kit.count / kit.peak / kit.cap / kit.stats()    canlı kaynak sayısı (ölü ama bitmemişler dahil)
 *
 * Kural: kaynak üretimi tavanı AŞARSA fırlatır (çağıran grubu destroy edip vazgeçer); canTake ile önceden sorulur.
 * Rastgelelik yok: tampon başlangıç ofsetleri artan sayaçtan türetilir.
 */
const GOLDEN = 0.6180339887;

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function createNodeKit({ cap: cap0 = 24 } = {}) {
  let cap = Math.max(0, Math.floor(cap0));
  let ctx = null;
  let count = 0;
  let peak = 0;
  let created = 0;
  let released = 0;
  let serial = 0;
  const groups = new Set();

  function finalizeSrc(g, e) {
    if (e.done) return;
    e.done = true;
    count--;
    released++;
    safe(() => e.node.disconnect());
    g.pending--;
    if (g.dead && g.pending <= 0) finalizeGroup(g);
  }

  function finalizeGroup(g) {
    if (g.finalized) return;
    g.finalized = true;
    for (let i = 0; i < g.srcs.length; i++) {
      const e = g.srcs[i];
      if (!e.done) {
        e.done = true;
        count--;
        released++;
      }
      safe(() => e.node.disconnect());
    }
    for (let i = 0; i < g.nodes.length; i++) safe(() => g.nodes[i].disconnect());
    groups.delete(g);
  }

  function makeGroup(label) {
    const g = {
      label,
      nodes: [],
      srcs: [],
      dead: false,
      finalized: false,
      pending: 0,
      endAt: Infinity,
      out: null,
    };
    g.gain = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      g.nodes.push(n);
      return n;
    };
    g.filter = (type, f, q) => {
      const n = ctx.createBiquadFilter();
      n.type = type;
      n.frequency.value = f;
      if (q !== undefined) n.Q.value = q;
      g.nodes.push(n);
      return n;
    };
    g.stereo = () => {
      if (typeof ctx.createStereoPanner !== 'function') return null;
      const n = ctx.createStereoPanner();
      g.nodes.push(n);
      return n;
    };
    function addSrc(node, startArgs) {
      if (count + 1 > cap) throw new Error('nodeBudget');
      const e = { node, done: false };
      node.onended = () => finalizeSrc(g, e);
      g.srcs.push(e);
      g.pending++;
      count++;
      created++;
      if (count > peak) peak = count;
      node.start(startArgs.when, startArgs.offset);
      return node;
    }
    g.osc = (type, f, when) => {
      const n = ctx.createOscillator();
      n.type = type;
      n.frequency.value = f;
      return addSrc(n, { when: when === undefined ? 0 : when });
    };
    g.noise = (buf, when) => {
      const n = ctx.createBufferSource();
      n.buffer = buf;
      n.loop = true;
      serial++;
      const off = buf && buf.duration ? ((serial * GOLDEN) % 1) * buf.duration * 0.5 : 0;
      return addSrc(n, { when: when === undefined ? 0 : when, offset: off });
    };
    g.connect = (a, b) => {
      a.connect(b);
      return b;
    };
    g.stopAt = (t) => {
      for (let i = 0; i < g.srcs.length; i++) {
        const e = g.srcs[i];
        if (!e.done) safe(() => e.node.stop(t));
      }
      g.endAt = t;
    };
    /** Tek atımlık ses: kaynaklar endT'de durur, grup bitince temizlenir (sönümleme çağıranın zarfında). */
    g.finish = (endT) => {
      if (g.dead) return;
      g.dead = true;
      g.stopAt(endT);
      if (g.pending <= 0) finalizeGroup(g);
    };
    g.dispose = (fade) => {
      if (g.dead) return;
      g.dead = true;
      const f = fade > 0 ? fade : 0;
      const t = ctx ? ctx.currentTime : 0;
      if (g.out && f > 0) safe(() => g.out.gain.setTargetAtTime(0, t, f / 3));
      g.stopAt(t + f + 0.02);
      if (g.pending <= 0) finalizeGroup(g);
    };
    g.destroy = () => {
      if (g.finalized) return;
      g.dead = true;
      const t = ctx ? ctx.currentTime : 0;
      for (let i = 0; i < g.srcs.length; i++) {
        const e = g.srcs[i];
        if (!e.done) safe(() => e.node.stop(t));
      }
      finalizeGroup(g);
    };
    groups.add(g);
    return g;
  }

  return {
    get count() {
      return count;
    },
    get peak() {
      return peak;
    },
    get cap() {
      return cap;
    },
    get groups() {
      return groups.size;
    },
    get ctx() {
      return ctx;
    },
    setCap(n) {
      cap = Math.max(0, Math.floor(n));
    },
    setContext(c) {
      if (c === ctx) return;
      this.destroyAll();
      ctx = c;
    },
    canTake(n) {
      return count + n <= cap;
    },
    group(label) {
      if (!ctx) throw new Error('noContext');
      return makeGroup(label);
    },
    /** Süresi (endAt) dolmuş ölü grupları temizler; onended gelmeyen bağlamlar için emniyet. */
    sweep(now) {
      if (groups.size === 0) return;
      const dead = [];
      groups.forEach((g) => {
        if (g.dead && now >= g.endAt + 0.05) dead.push(g);
      });
      for (let i = 0; i < dead.length; i++) finalizeGroup(dead[i]);
    },
    destroyAll() {
      const all = Array.from(groups);
      for (let i = 0; i < all.length; i++) all[i].destroy();
    },
    stats() {
      return { count, peak, cap, groups: groups.size, created, released };
    },
  };
}
