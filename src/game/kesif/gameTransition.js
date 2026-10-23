/*
 * KEŞİF — BOYUT GEÇİŞ MAKİNESİ. Sözleşme KESIF_CITY_CONTRACT §5 "Geçiş makinesi".
 *
 *   createTransition(G, deps) → tr
 *       deps: {mgr (gameDimension), onCharge?(k 0..1), onPhase?(name,st), onFinish?(result,st), propsReady?(st) → bool, now?()}
 *   tr.start(spec) → {ok, reason?}      spec: {to, reason:'gate'|'terminal'|'home', linkFrom?, terminal?, home?, refund?(why), onDone?(result)}
 *   tr.startBoot(spec) → {ok}           kayıt şehirde açıldı: ekran kapalı başlar (swap hemen), "hold" + açılış (charge/warp-in yok)
 *   tr.update(dt)                       frameUpdate'ten her kare (dt = gerçek kare süresi; duraklatılmışken 0)
 *   tr.cancel(why)                      destroy / hata: bayrakları ve post efektini temizler (swap geri alınmaz — durum her zaman tutarlıdır)
 *   tr.active / tr.phase / tr.progress / tr.info
 *
 * Evreler (süreler sn): charge 0,8 → warpIn 0,6 → [SWAP] → hold (chunkManager hazır: ≥49 sütun mesh + varış kesitleri + proplar; ≥0,6 sn sonra
 * "Boyut geçişi…" çubuğu; 20 sn zaman aşımı → kaynağa dön + maliyet iadesi) → warpOut 0,7. Toplam en az 2,7 sn. reducedMotion/erişilebilirlik: warp yok,
 * 0,4 sn siyaha karartma (charge 0,2; hold ≥ 0,3; açılış 0,4) — ≤3 Hz, sarsıntı yok.
 * Süre boyunca: G.simFrozen (sabit adımlar dondu: fizik/girdi/saat), G.transitionActive (otomatik kayıt bastırılır), girdi eylemleri yok sayılır
 * (game.js dispatchAction). Sonunda TEK kez kayıt: G.requestSave('dimension').
 */
export const TRANSITION_TIMING = Object.freeze({
  charge: 0.8,
  warpIn: 0.6,
  warpOut: 0.7,
  minTotal: 2.7,
  overlayAfter: 0.6,
  timeout: 20,
  reduced: Object.freeze({ charge: 0.2, warpIn: 0.4, warpOut: 0.4, minHold: 0.3 }),
});

export const TRANSITION_MESSAGES = Object.freeze({
  abort: 'Boyut geçişi tamamlanamadı: geri döndün, portal şarjın iade edildi.',
  loading: 'Boyut geçişi…',
  arrived: 'Neon Meridyen\'e vardın.',
  home: 'Ana diyara döndün.',
});

const ease = (x) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};

function nowDefault() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export function createTransition(G, deps) {
  const d = deps || {};
  const mgr = d.mgr;
  const now = d.now || nowDefault;
  const T = TRANSITION_TIMING;
  const st = {
    phase: 'idle',
    t: 0,
    total: 0,
    holdT: 0,
    spec: null,
    from: 'overworld',
    to: 'overworld',
    aborted: false,
    recover: false,
    swapped: false,
    frames: 0,
    propRebuilds: 0,
    swapMs: 0,
    startedAt: 0,
    holdMs: 0,
    totalMs: 0,
    count: 0,
    reduced: false,
    boot: false,
    metaBefore: null,
    loadingShown: false,
    hold: 0,
  };
  let disposed = false;

  function reducedNow() {
    return !!(G.reducedMotion || G.accessibility);
  }

  function dur(name) {
    if (!st.reduced) return T[name];
    if (name === 'charge') return T.reduced.charge;
    if (name === 'warpIn') return T.reduced.warpIn;
    return T.reduced.warpOut;
  }

  function setWarp(v) {
    if (G.postfx && typeof G.postfx.setEffects === 'function') G.postfx.setEffects({ warp: v });
  }

  function setLoading(on, progress) {
    if (on) {
      G.dimLoading = { active: true, progress: Math.max(0, Math.min(1, progress)), label: TRANSITION_MESSAGES.loading };
    } else if (G.dimLoading) {
      G.dimLoading = { active: false, progress: 1, label: '' };
    }
    if (G.hud) G.hud.dimLoading = G.dimLoading || null;
    st.loadingShown = on;
  }

  function enter(phase) {
    st.phase = phase;
    st.t = 0;
    if (typeof d.onPhase === 'function') d.onPhase(phase, st);
  }

  function propsOk() {
    if (typeof d.propsReady === 'function') return !!d.propsReady(st);
    return true;
  }

  function sound(name) {
    if (typeof G.sound === 'function') G.sound(name, undefined, { vol: 0.9 });
  }

  function finish(result) {
    setWarp(0);
    if (G.postfx && typeof G.postfx.setEffects === 'function') G.postfx.setEffects({ fade: 0 });
    setLoading(false, 1);
    G.simFrozen = false;
    G.transitionActive = false;
    st.phase = 'idle';
    st.spec = null;
    st.count++;
    st.totalMs = now() - st.startedAt;
    if (typeof d.onCharge === 'function') d.onCharge(0);
    const spec = result.spec;
    if (typeof d.onFinish === 'function') d.onFinish(result, st);
    if (typeof G.requestSave === 'function') G.requestSave('dimension');
    if (spec && typeof spec.onDone === 'function') spec.onDone(result);
  }

  /** swap hata fırlatırsa oyuncu takılı kalmasın: hata günlüğe, sonuç {ok:false}. */
  function safeSwap(to, o) {
    try {
      return mgr.swap(to, o);
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] boyut geçişi hatası:', err);
      if (G.opts && G.opts.strictSystems) throw err;
      return { ok: false, reason: 'hata' };
    }
  }

  /** Başarısız (zaman aşımı) sıçrama iz bırakmasın: swap öncesi ziyaret/bekleme/bağlantı alanları. `calibrated` ASLA geri yazılmaz (iade kuralı dimGate.refund'ındadır). */
  function snapshotMeta() {
    const m = mgr.dimMeta;
    if (!m) return null;
    return {
      visits: m.visits, firstArrival: m.firstArrival, lastHopAt: m.lastHopAt, link: m.link, overworldPos: m.overworldPos, hops: mgr.stats ? mgr.stats.hops : undefined,
    };
  }

  function restoreMeta(snap) {
    const m = mgr.dimMeta;
    if (!snap || !m) return;
    m.visits = snap.visits;
    m.firstArrival = snap.firstArrival;
    m.lastHopAt = snap.lastHopAt;
    m.link = snap.link;
    m.overworldPos = snap.overworldPos;
    if (mgr.stats && snap.hops !== undefined) mgr.stats.hops = snap.hops;
  }

  function doSwap() {
    const spec = st.spec;
    const t0 = now();
    st.metaBefore = snapshotMeta();
    const res = safeSwap(spec.to, {
      reason: spec.reason || 'gate', linkFrom: spec.linkFrom, terminal: spec.terminal, home: spec.home, arrival: spec.arrival,
    });
    st.swapMs = now() - t0;
    if (!res.ok) {
      st.aborted = true;
      st.swapped = false;
      return false;
    }
    st.swapped = true;
    st.frames = 0;
    st.holdT = 0;
    const pr = G.propRenderer && G.propRenderer.stats ? G.propRenderer.stats.rebuilds : 0;
    st.propRebuilds = pr;
    return true;
  }

  function abortBack(why) {
    // yeni boyut hazırlanamadı: kaynak boyuta dön (aynı çıkış noktası), maliyet iade
    const spec = st.spec;
    st.aborted = true;
    const back = safeSwap(st.from, { reason: 'abort', arrival: mgr.get(st.from) && mgr.get(st.from).exit ? mgr.get(st.from).exit : undefined, maxR: 12 });
    // başarısız varış ziyaret sayılmaz: ilk-varış ipucu korunur, atlama bekleme süresi (20 sn) uygulanmaz
    if (back && back.ok) restoreMeta(st.metaBefore);
    if (typeof spec.refund === 'function') spec.refund(why || 'zaman');
    if (typeof mgr.say === 'function') mgr.say(TRANSITION_MESSAGES.abort, 'dim:abort');
    G.emit({ type: 'dimensionAborted', from: st.from, to: st.to, reason: why || 'zaman' });
    return back;
  }

  function begin(spec, boot) {
    if (disposed) return { ok: false, reason: 'atildi' };
    if (st.phase !== 'idle') return { ok: false, reason: 'surüyor' };
    if (!spec || !mgr) return { ok: false, reason: 'gecersiz' };
    st.spec = spec;
    st.from = mgr.current;
    st.to = spec.to;
    st.aborted = false;
    st.recover = false;
    st.swapped = false;
    st.metaBefore = null;
    st.total = 0;
    st.holdT = 0;
    st.startedAt = now();
    st.reduced = reducedNow();
    st.boot = !!boot;
    st.loadingShown = false;
    G.simFrozen = true;
    G.transitionActive = true;
    if (G.input && typeof G.input.releaseAll === 'function') G.input.releaseAll();
    if (boot) {
      setWarp(1);
      if (!doSwap()) {
        finish({ ok: false, aborted: true, spec });
        return { ok: false, reason: 'swap' };
      }
      enter('hold');
      return { ok: true };
    }
    enter('charge');
    sound('dim:charge');
    if (typeof G.haptic === 'function') G.haptic('medium');
    if (typeof G.speak === 'function' && (G.accessibility || st.reduced)) G.speak('Boyut geçişi başlıyor.');
    return { ok: true };
  }

  function update(dt) {
    if (disposed || st.phase === 'idle') return;
    try {
      tick(dt);
    } catch (err) {
      // beklenmeyen hata: kilidi ve post efektini bırak (soft-lock yok); kayıt tutarlı kalır
      if (typeof console !== 'undefined' && console.error) console.error('[kesif] geçiş makinesi hatası:', err);
      if (G.opts && G.opts.strictSystems) throw err;
      cancel('hata');
    }
  }

  function tick(dt) {
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    st.t += step;
    st.total += step;
    switch (st.phase) {
      case 'charge': {
        const dd = dur('charge');
        if (typeof d.onCharge === 'function') d.onCharge(Math.min(1, st.t / dd));
        if (st.t >= dd) {
          enter('warpIn');
          if (!st.reduced) sound('dim:whoosh');
        }
        break;
      }
      case 'warpIn': {
        const dd = dur('warpIn');
        setWarp(ease(st.t / dd));
        if (typeof d.onCharge === 'function') d.onCharge(1);
        if (st.t >= dd) {
          setWarp(1);
          if (!doSwap()) {
            if (st.spec && typeof st.spec.refund === 'function') st.spec.refund('swap');
            enter('warpOut');
            break;
          }
          enter('hold');
        }
        break;
      }
      case 'hold': {
        st.frames++;
        st.holdT += step;
        const minHold = st.reduced ? T.reduced.minHold : 0;
        const needTotal = st.reduced || st.recover ? 0 : T.minTotal - dur('warpOut');
        const rd = mgr.readiness(3);
        if (st.holdT >= T.overlayAfter && !(rd.ready && propsOk())) setLoading(true, rd.progress);
        else if (st.loadingShown && rd.ready) setLoading(true, 1);
        const timeUp = st.holdT >= T.timeout;
        const ready = rd.ready && propsOk() && st.frames >= 3 && st.holdT >= minHold && (st.boot || st.total >= needTotal);
        if (ready) {
          setLoading(false, 1);
          enter('warpOut');
          sound('dim:arrive');
        } else if (timeUp) {
          setLoading(false, 1);
          if (!st.recover) {
            // 20 sn aşıldı: kaynağa dön (maliyet iade); kaynak da hazır olana dek tut, o da gecikirse yine de aç (takılı kalma yok)
            abortBack('zaman');
            st.recover = true;
            st.holdT = 0;
            st.frames = 0;
          } else {
            enter('warpOut');
            sound('dim:arrive');
          }
        }
        break;
      }
      case 'warpOut': {
        const dd = dur('warpOut');
        setWarp(1 - ease(st.t / dd));
        if (st.t >= dd) {
          const result = {
            ok: !st.aborted, aborted: st.aborted, from: st.from, to: st.aborted ? st.from : st.to, spec: st.spec, holdMs: st.holdT * 1000,
          };
          finish(result);
        }
        break;
      }
      default:
        break;
    }
  }

  function cancel(why) {
    if (st.phase === 'idle') return;
    setWarp(0);
    setLoading(false, 1);
    G.simFrozen = false;
    G.transitionActive = false;
    const spec = st.spec;
    st.phase = 'idle';
    st.spec = null;
    if (typeof d.onCharge === 'function') d.onCharge(0);
    if (spec && !st.swapped && typeof spec.refund === 'function' && why !== 'destroy') spec.refund(why || 'iptal');
  }

  const tr = {
    start: (spec) => begin(spec, false),
    startBoot: (spec) => begin(spec, true),
    update,
    cancel,
    dispose() {
      if (disposed) return;
      cancel('destroy');
      disposed = true;
    },
    get active() {
      return st.phase !== 'idle';
    },
    get phase() {
      return st.phase;
    },
    get progress() {
      switch (st.phase) {
        case 'charge': return Math.min(1, st.t / dur('charge')) * 0.25;
        case 'warpIn': return 0.25 + Math.min(1, st.t / dur('warpIn')) * 0.25;
        case 'hold': return 0.5 + Math.min(1, st.holdT / 3) * 0.3;
        case 'warpOut': return 0.8 + Math.min(1, st.t / dur('warpOut')) * 0.2;
        default: return 0;
      }
    },
    get info() {
      return {
        phase: st.phase, t: st.t, total: st.total, holdT: st.holdT, from: st.from, to: st.to, aborted: st.aborted, swapped: st.swapped, count: st.count, swapMs: st.swapMs,
        totalMs: st.totalMs, reduced: st.reduced, loading: st.loadingShown,
      };
    },
    state: st,
  };
  return tr;
}
