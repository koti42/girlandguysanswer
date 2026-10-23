/*
 * KEŞİF — cityLocks PANEL DENETLEYİCİSİ: kod / kart / çözme (mini oyun) / asansör panellerinin durumu, girdisi ve düz-JSON görüntüsü.
 * React tarafı (components/game/kesif/city/LockPanel.jsx + HackPanel.jsx) yalnız `snapshot()` okur ve `input(act)` çağırır; bu dosya DOM/three bilmez.
 *
 *   createPanels(deps) → { open(spec), close(), isOpen(), type(), tick(dt), snapshot(), input(act) }
 *   deps: { book, citySeed(), hasItem(key)→bool, accessibility()→bool, say(text), sound(name, opts?), solved(info), elevator: {go(rec,i), halt(rec), view(rec)} }
 *   open(spec): {type:'lock', lotId, lock, door, hasClue} | {type:'elevator', rec}
 *
 * act (JSON):  {op:'close'}
 *   kod:      {op:'digit', value:1..6} {op:'back'} {op:'clear'} {op:'submit'}
 *   kart:     {op:'card'}
 *   çözme:    {op:'start'} · simon {op:'press', index} {op:'replay'} · levers {op:'press', index} {op:'reset'} · dice {op:'step', index, dir} {op:'set', index, value} {op:'submit'}
 *   asansör:  {op:'go', stop} {op:'halt'}
 * input → {ok:boolean, result?:string}. Yanlış deneme: kilit 20 sn dinlenir (KALICI DEĞİL); soğumada girdi reddedilir ('soguma').
 */
import { HACK_INFO, createHack } from '../sim/city/hack/index.js';
import { SIMON_SYMBOLS } from '../sim/city/hack/simon.js';
import {
  CARD_COLORS, CARD_KEYS, CARD_NAMES, COOLDOWN_SEC, lockTitle,
} from '../sim/city/interior/locks.js';

const SOLVED_CLOSE_SEC = 1.5;

export function createPanels(deps) {
  let P = null;

  function spec() {
    return deps.book.specOf(P.lotId, P.lock);
  }

  function cooldownLeft() {
    return P && P.lock ? deps.book.cooldownLeft(P.lotId, P.lock) : 0;
  }

  function finish(how) {
    P.status = 'cozuldu';
    P.closeIn = SOLVED_CLOSE_SEC;
    P.message = how === 'kart' ? 'Kart okundu. Kilit açıldı!' : 'Kilit açıldı!';
    deps.sound('prop:door');
    deps.solved({ lotId: P.lotId, lock: P.lock, door: P.door, how });
  }

  function wrong(msg) {
    deps.sound('prop:locked');
    P.message = msg + ' Kilit ' + COOLDOWN_SEC + ' saniye dinleniyor.';
    deps.say(P.message);
  }

  /* ------------------------------------------------------------------------------------------ açma */
  function open(s) {
    if (!s) return false;
    if (s.type === 'elevator') {
      P = {
        type: 'asansor', rec: s.rec, message: '', status: 'bekliyor', closeIn: 0,
      };
      return true;
    }
    if (s.type !== 'lock' || !s.lock) return false;
    const k = s.lock.kind;
    P = {
      type: k === 'kod' ? 'kod' : k === 'kart' ? 'kart' : k === 'mini_hack' ? 'hack' : 'serbest',
      lotId: s.lotId,
      lock: s.lock,
      door: s.door,
      hasClue: !!s.hasClue,
      entered: [],
      feedback: null,
      message: '',
      status: 'bekliyor',
      closeIn: 0,
      machine: null,
      phase: 'ready',
      lastLit: -1,
      game: null,
    };
    if (P.type === 'hack') {
      const sp = spec();
      P.game = sp.game;
    }
    if (P.type === 'serbest') {
      P = null;
      return false;
    }
    return true;
  }

  function close() {
    P = null;
  }

  /* ------------------------------------------------------------------------------------------ hack */
  function startHack() {
    const cd = cooldownLeft();
    if (cd > 0) return { ok: false, result: 'soguma' };
    const prm = deps.book.hackParams(P.lotId, P.lock);
    if (!prm) return { ok: false, result: 'gecersiz' };
    P.machine = createHack({
      game: prm.game, seed: prm.seed, tier: prm.tier, accessibility: deps.accessibility(),
    });
    P.phase = 'play';
    P.message = '';
    P.lastLit = -1;
    deps.sound('prop:beep');
    return { ok: true, result: 'basladi' };
  }

  function afterHackStep() {
    const m = P.machine;
    if (!m || P.phase !== 'play') return;
    if (m.status === 'won') {
      P.phase = 'won';
      const r = deps.book.attemptHack(P.lotId, P.lock, 'won');
      if (r.result === 'solved') finish('hack');
      else P.message = 'Kilit zaten açık.';
    } else if (m.status === 'lost') {
      P.phase = 'lost';
      const r = deps.book.attemptHack(P.lotId, P.lock, 'lost');
      if (r.result === 'wrong') wrong(m.view().reason === 'zaman' ? 'Süre doldu.' : 'Olmadı.');
    }
  }

  function hackInput(act) {
    if (act.op === 'start') {
      if (P.phase === 'play') return { ok: false, result: 'sürüyor' };
      return startHack();
    }
    const m = P.machine;
    if (!m || P.phase !== 'play') return { ok: false, result: 'hazir-degil' };
    let r = '';
    if (m.kind === 'simon') {
      if (act.op === 'press') {
        r = m.press(act.index);
        if (r !== 'ignored') deps.sound('rune:' + (act.index | 0), { vol: 0.8 });
      } else if (act.op === 'replay') r = m.replay() ? 'tekrar' : 'ignored';
    } else if (m.kind === 'levers') {
      if (act.op === 'press') {
        r = m.press(act.index);
        if (r !== 'ignored') deps.sound('prop:beep');
      } else if (act.op === 'reset') r = m.reset() ? 'sifirlandi' : 'ignored';
    } else if (m.kind === 'dice') {
      if (act.op === 'step') r = m.step(act.index, act.dir) ? 'ok' : 'ignored';
      else if (act.op === 'set') r = m.set(act.index, act.value) ? 'ok' : 'ignored';
      else if (act.op === 'submit') {
        r = m.submit();
        if (r === 'wrong') deps.sound('prop:locked', { vol: 0.5 });
      }
      if (r === 'ok') deps.sound('prop:beep', { vol: 0.4 });
    }
    afterHackStep();
    return { ok: r !== '' && r !== 'ignored', result: r };
  }

  /* ------------------------------------------------------------------------------------------ giriş */
  function input(act) {
    if (!P || !act || typeof act !== 'object') return { ok: false, result: 'panel-yok' };
    if (act.op === 'close') {
      close();
      return { ok: true, result: 'kapandi' };
    }
    if (P.status === 'cozuldu') return { ok: false, result: 'cozuldu' };
    if (P.type === 'asansor') {
      if (act.op === 'go') {
        const r = deps.elevator.go(P.rec, act.stop | 0);
        if (r.ok) {
          P.status = 'cozuldu';
          P.closeIn = 0.35;
          P.message = r.message || '';
        } else P.message = r.message || '';
        return r;
      }
      if (act.op === 'halt') return deps.elevator.halt(P.rec);
      return { ok: false, result: 'gecersiz' };
    }
    if (cooldownLeft() > 0) {
      P.message = 'Kilit dinleniyor: ' + Math.ceil(cooldownLeft()) + ' sn.';
      return { ok: false, result: 'soguma' };
    }
    if (P.type === 'hack') return hackInput(act);
    if (P.type === 'kod') {
      const sp = spec();
      if (act.op === 'digit') {
        const v = Math.floor(Number(act.value));
        if (!(v >= 1 && v <= 6) || P.entered.length >= sp.digits) return { ok: false, result: 'gecersiz' };
        P.entered.push(v);
        P.feedback = null;
        deps.sound('prop:beep', { vol: 0.5, pitch: 0.9 + v * 0.08 });
        return { ok: true, result: 'hane' };
      }
      if (act.op === 'back') {
        P.entered.pop();
        return { ok: true, result: 'silindi' };
      }
      if (act.op === 'clear') {
        P.entered.length = 0;
        P.feedback = null;
        return { ok: true, result: 'temiz' };
      }
      if (act.op === 'submit') {
        if (P.entered.length !== sp.digits) {
          P.message = sp.digits + ' hane girmelisin.';
          return { ok: false, result: 'eksik' };
        }
        const r = deps.book.attemptCode(P.lotId, P.lock, P.entered.slice());
        if (r.result === 'solved') {
          finish('kod');
          return { ok: true, result: 'cozuldu' };
        }
        if (r.result === 'wrong') {
          P.feedback = { exact: r.exact, present: r.present };
          wrong('Yanlış kod. Doğru yerde ' + r.exact + ', yanlış yerde ' + r.present + ' hane var.');
          P.entered.length = 0;
          return { ok: false, result: 'yanlis' };
        }
        return { ok: false, result: r.result };
      }
      return { ok: false, result: 'gecersiz' };
    }
    if (P.type === 'kart') {
      if (act.op !== 'card') return { ok: false, result: 'gecersiz' };
      const r = deps.book.attemptCard(P.lotId, P.lock, deps.hasItem);
      if (r.result === 'solved') {
        finish('kart');
        return { ok: true, result: 'cozuldu' };
      }
      if (r.result === 'missing') {
        P.message = 'Bu kilit için ' + CARD_NAMES[r.need - 1] + ' ya da daha yüksek bir kart gerekli.';
        deps.sound('prop:locked', { vol: 0.5 });
        deps.say(P.message);
        return { ok: false, result: 'kart-yok' };
      }
      return { ok: false, result: r.result };
    }
    return { ok: false, result: 'gecersiz' };
  }

  /* ------------------------------------------------------------------------------------------ zaman */
  function tick(dt) {
    if (!P) return false;
    if (P.closeIn > 0) {
      P.closeIn -= dt;
      if (P.closeIn <= 0) {
        close();
        return true;
      }
    }
    if (P && P.type === 'hack' && P.machine && P.phase === 'play') {
      const m = P.machine;
      m.tick(dt);
      const v = m.kind === 'simon' ? m.view() : null;
      if (v && v.lit !== P.lastLit) {
        if (v.lit >= 0) deps.sound('rune:' + v.lit, { vol: 0.8 });
        P.lastLit = v.lit;
      }
      afterHackStep();
    }
    if (P && P.type === 'hack' && (P.phase === 'lost') && cooldownLeft() <= 0 && P.status !== 'cozuldu') {
      P.phase = 'ready';
      P.machine = null;
      P.message = 'Kilit dinlendi. Yeniden deneyebilirsin.';
    }
    return false;
  }

  /* ------------------------------------------------------------------------------------------ görünüm */
  function snapshot() {
    if (!P) return null;
    if (P.type === 'asansor') {
      const v = deps.elevator.view(P.rec);
      return {
        v: 1,
        type: 'asansor',
        title: 'Asansör',
        status: P.status,
        message: P.message,
        stops: v.stops,
        phase: v.phase,
        live: P.message || (v.phase === 'moving' ? 'Asansör hareket ediyor.' : 'Gitmek istediğin katı seç.'),
        closing: P.closeIn > 0,
      };
    }
    const cd = cooldownLeft();
    const sp = spec();
    const base = {
      v: 1,
      type: P.type,
      title: lockTitle(P.lock),
      tier: P.lock.tier,
      status: P.status === 'cozuldu' ? 'cozuldu' : cd > 0 ? 'soguma' : 'bekliyor',
      cooldown: Math.ceil(cd),
      cooldownMax: COOLDOWN_SEC,
      message: P.message,
      closing: P.closeIn > 0,
    };
    if (P.type === 'kod') {
      return Object.assign(base, {
        digits: sp.digits,
        entered: P.entered.slice(),
        feedback: P.feedback,
        hasClue: P.hasClue,
        live: base.status === 'cozuldu' ? P.message : base.status === 'soguma' ? 'Kilit dinleniyor: ' + base.cooldown + ' saniye.'
          : P.message || (sp.digits + ' haneli kodu gir. Her hane 1 ile 6 arasındadır.'),
      });
    }
    if (P.type === 'kart') {
      const cards = [];
      for (let lv = 1; lv <= 3; lv++) cards.push({ level: lv, name: CARD_NAMES[lv - 1], color: CARD_COLORS[lv - 1], has: deps.hasItem(CARD_KEYS[lv - 1]) });
      const ok = cards.some((c) => c.level >= sp.card && c.has);
      return Object.assign(base, {
        need: sp.card,
        needName: CARD_NAMES[sp.card - 1],
        cards,
        canRead: ok,
        live: base.status === 'cozuldu' ? P.message : P.message || (ok ? 'Kartın uygun. Okutabilirsin.' : CARD_NAMES[sp.card - 1] + ' gerekli.'),
      });
    }
    // hack
    const info = HACK_INFO[P.game];
    const view = P.machine ? P.machine.view() : null;
    return Object.assign(base, {
      game: P.game,
      name: info.name,
      short: info.short,
      how: info.how.slice(),
      phase: P.phase,
      view,
      symbols: P.game === 'simon' ? SIMON_SYMBOLS : null,
      accessibility: deps.accessibility(),
      live: base.status === 'cozuldu' ? P.message : base.status === 'soguma' ? 'Kilit dinleniyor: ' + base.cooldown + ' saniye.'
        : (view && view.live) || P.message || info.short,
    });
  }

  return {
    open,
    close,
    isOpen: () => P !== null,
    type: () => (P ? P.type : null),
    current: () => P,
    tick,
    snapshot,
    input,
  };
}
