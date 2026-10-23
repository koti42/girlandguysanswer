// @vitest-environment jsdom
/*
 * Neon Meridyen kilit / çözme / asansör panelleri (locks_hack): klavye, dokunmatik hedef boyutu, aria (dialog, canlı bölge, progressbar), soğuma,
 * mini oyun arayüzleri, ev sahibi yoklaması ve GERÇEK sistemle (cityLocks) uçtan uca etkileşim.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import LockPanel from '../city/LockPanel.jsx';
import HackPanel from '../city/HackPanel.jsx';
import LockPanelHost from '../city/LockPanelHost.jsx';
import { liveTextOf } from '../city/lockPanelUtils.js';
import { SIMON_SYMBOLS } from '../../../../game/kesif/sim/city/hack/simon.js';
import { createHack } from '../../../../game/kesif/sim/city/hack/index.js';
import { solveLevers } from '../../../../game/kesif/sim/city/hack/levers.js';
import { lockSeed, lockSpec, normalizeLock } from '../../../../game/kesif/sim/city/interior/locks.js';
import { findLockedBuilding, makeCityG, propsAround } from '../../../../game/kesif/systems/cityLocksTestKit.js';
import { doorSides } from '../../../../game/kesif/sim/city/interior/locks.js';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CSS = fs.readFileSync(path.join(here, '../city/lockPanel.css'), 'utf8');

afterEach(() => cleanup());

const kod = (o) => Object.assign({
  v: 1, type: 'kod', title: 'Kod Kilidi', tier: 1, status: 'bekliyor', cooldown: 0, cooldownMax: 20, message: '', closing: false, digits: 4, entered: [], feedback: null, hasClue: true, live: '4 haneli kodu gir.',
}, o);

describe('LockPanel: kod kilidi', () => {
  it('dialog + başlık + 4 hane yuvası; rakam düğmeleri 1–6; tıklama onInput(digit) çağırır', () => {
    const onInput = vi.fn();
    render(<LockPanel snap={kod()} onInput={onInput} onClose={() => {}} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Kod Kilidi')).toBeInTheDocument();
    expect(screen.getByTestId('lock-slots').children).toHaveLength(4);
    for (let d = 1; d <= 6; d++) fireEvent.click(screen.getByRole('button', { name: 'Rakam ' + d }));
    expect(onInput.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5, 6].map((v) => ({ op: 'digit', value: v })));
  });

  it('klavye: 1–6 hane, Backspace sil, Delete temizle, Enter gir (yalnız hane sayısı tamamsa Gir etkin)', () => {
    const onInput = vi.fn();
    const { container } = render(<LockPanel snap={kod({ entered: [1, 2, 3, 4] })} onInput={onInput} onClose={() => {}} />);
    const body = container.querySelector('.klk');
    fireEvent.keyDown(body, { key: '3' });
    fireEvent.keyDown(body, { key: '7' });
    fireEvent.keyDown(body, { key: 'Backspace' });
    fireEvent.keyDown(body, { key: 'Delete' });
    fireEvent.keyDown(body, { key: 'Enter' });
    expect(onInput.mock.calls.map((c) => c[0])).toEqual([{ op: 'digit', value: 3 }, { op: 'back' }, { op: 'clear' }, { op: 'submit' }]);
    expect(screen.getByTestId('lock-submit')).not.toBeDisabled();
  });

  it('Gir düğmesi eksik hanede pasif; girilen haneler yuvalarda ve aria-label\'da', () => {
    render(<LockPanel snap={kod({ entered: [2, 5] })} onInput={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('lock-submit')).toBeDisabled();
    const slots = screen.getByTestId('lock-slots').children;
    expect(slots[0]).toHaveTextContent('2');
    expect(slots[1]).toHaveTextContent('5');
    expect(slots[2]).toHaveAttribute('aria-label', '3. hane boş');
  });

  it('soğuma: düğmeler pasif, progressbar değeri/metni, canlı bölge saniye OKUMAZ', () => {
    const snap = kod({ status: 'soguma', cooldown: 14, live: 'Kilit dinleniyor: 14 saniye.' });
    render(<LockPanel snap={snap} onInput={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Rakam 1' })).toBeDisabled();
    const bar = screen.getByRole('progressbar', { name: 'Kilit dinlenme süresi' });
    expect(bar).toHaveAttribute('aria-valuenow', '14');
    expect(bar).toHaveAttribute('aria-valuemax', '20');
    expect(bar).toHaveAttribute('aria-valuetext', '14 saniye kaldı');
    expect(screen.getByTestId('lock-live')).toHaveTextContent('Kilit dinleniyor.');
    expect(screen.getByTestId('lock-live').textContent).not.toMatch(/\d/);
    expect(liveTextOf(snap)).toBe('Kilit dinleniyor.');
    expect(liveTextOf(null)).toBe('');
  });

  it('geri bildirim: doğru yer / yanlış yer hem simge hem sözcükle (renk tek başına değil)', () => {
    render(<LockPanel snap={kod({ feedback: { exact: 2, present: 1 } })} onInput={() => {}} onClose={() => {}} />);
    const fb = screen.getByTestId('lock-feedback');
    expect(fb).toHaveTextContent('Doğru yerde: 2');
    expect(fb).toHaveTextContent('Yanlış yerde: 1');
    expect(fb.textContent).toMatch(/✓/);
    expect(fb.textContent).toMatch(/≈/);
  });

  it('çözüldü: başarı iletisi; canlı bölge duyurur', () => {
    render(<LockPanel snap={kod({ status: 'cozuldu', message: 'Kilit açıldı!', live: 'Kilit açıldı!' })} onInput={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('lock-solved')).toHaveTextContent('Kilit açıldı!');
    expect(screen.getByTestId('lock-live')).toHaveAttribute('aria-live', 'polite');
  });

  it('Esc ve ✕ kapatır (PanelShell)', () => {
    const onClose = vi.fn();
    render(<LockPanel snap={kod()} onInput={() => {}} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('LockPanel: kart okuyucu ve asansör', () => {
  const kart = (o) => Object.assign({
    v: 1, type: 'kart', title: 'Kart Okuyucu', tier: 1, status: 'bekliyor', cooldown: 0, cooldownMax: 20, message: '', need: 2, needName: 'Kimlik Kartı 2 (Turuncu)', canRead: false, live: 'Kimlik Kartı 2 (Turuncu) gerekli.',
    cards: [
      { level: 1, name: 'Kimlik Kartı 1 (Gri)', color: '#9aa3b2', has: true },
      { level: 2, name: 'Kimlik Kartı 2 (Turuncu)', color: '#ff9a3c', has: false },
      { level: 3, name: 'Kimlik Kartı 3 (Mor)', color: '#b07cff', has: false },
    ],
  }, o);

  it('kart listesi renk + numara + ad + Var/Yok; yetersizken okut pasif; yeterliyken onInput(card)', () => {
    const onInput = vi.fn();
    const { rerender } = render(<LockPanel snap={kart()} onInput={onInput} onClose={() => {}} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Var');
    expect(rows[1]).toHaveTextContent('Yok');
    expect(screen.getByTestId('lock-card')).toBeDisabled();
    rerender(<LockPanel snap={kart({ canRead: true })} onInput={onInput} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('lock-card'));
    expect(onInput).toHaveBeenCalledWith({ op: 'card' });
  });

  const asansor = (o) => Object.assign({
    v: 1, type: 'asansor', title: 'Asansör', status: 'bekliyor', message: '', phase: 'idle', live: 'Gitmek istediğin katı seç.', closing: false,
    stops: [
      { i: 0, name: 'Zemin kat (giriş holü)', floor: 0, here: true, current: true, target: false },
      { i: 1, name: 'Gökyüzü lobisi (15. kat)', floor: 14, here: false, current: false, target: false },
      { i: 2, name: 'Gökyüzü lobisi 2 (30. kat)', floor: 29, here: false, current: false, target: false },
    ],
  }, o);

  it('katlar yukarıdan aşağı; bulunulan kat pasif; tıklama ve 1–9 tuşları onInput(go)', () => {
    const onInput = vi.fn();
    const { container } = render(<LockPanel snap={asansor()} onInput={onInput} onClose={() => {}} />);
    const btns = screen.getAllByRole('button').filter((b) => b.className.indexOf('klk-stop') >= 0);
    expect(btns.map((b) => b.getAttribute('aria-label'))).toEqual(['Gökyüzü lobisi 2 (30. kat)', 'Gökyüzü lobisi (15. kat)', 'Zemin kat (giriş holü), buradasın']);
    expect(btns[2]).toBeDisabled();
    fireEvent.click(btns[1]);
    expect(onInput).toHaveBeenCalledWith({ op: 'go', stop: 1 });
    fireEvent.keyDown(container.querySelector('.klk'), { key: '3' });
    expect(onInput).toHaveBeenLastCalledWith({ op: 'go', stop: 2 });
    fireEvent.keyDown(container.querySelector('.klk'), { key: '8' });
    expect(onInput).toHaveBeenCalledTimes(2);
  });

  it('yoldayken "Dur" düğmesi görünür ve onInput(halt) çağırır', () => {
    const onInput = vi.fn();
    render(<LockPanel snap={asansor({ phase: 'moving' })} onInput={onInput} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('lock-halt'));
    expect(onInput).toHaveBeenCalledWith({ op: 'halt' });
  });
});

describe('HackPanel: mini oyunlar', () => {
  const base = (o) => Object.assign({
    v: 1, type: 'hack', title: 'Çözme Terminali', tier: 1, status: 'bekliyor', cooldown: 0, cooldownMax: 20, message: '', closing: false, accessibility: false,
  }, o);

  it('hazır aşama: nasıl oynanır (3 satır) + Başla; hiçbir oyun alanı yok; soğumada Başla pasif', () => {
    const onInput = vi.fn();
    const how = ['Bir.', 'İki.', 'Üç.'];
    const { rerender } = render(<HackPanel snap={base({ game: 'simon', name: 'Rün Dizisi', short: 'Tekrarla.', phase: 'ready', how, view: null })} onInput={onInput} onClose={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    fireEvent.click(screen.getByTestId('hack-start'));
    expect(onInput).toHaveBeenCalledWith({ op: 'start' });
    expect(screen.queryByTestId('rune-0')).toBeNull();
    rerender(<HackPanel snap={base({ game: 'simon', name: 'Rün Dizisi', short: 'Tekrarla.', phase: 'ready', how, view: null, status: 'soguma', cooldown: 9 })} onInput={onInput} onClose={() => {}} />);
    expect(screen.getByTestId('hack-start')).toBeDisabled();
  });

  const simon = (view, o) => base(Object.assign({
    game: 'simon', name: 'Rün Dizisi', short: 'Tekrarla.', phase: 'play', how: [], symbols: SIMON_SYMBOLS,
    view: Object.assign({
      phase: 'input', lit: -1, round: 2, len: 4, inputIdx: 0, timeLeft: 0, timeMax: 0, replays: -1, symbols: SIMON_SYMBOLS, live: 'Sıra sende.', sequenceText: null, reason: '', last: -1, lastOk: true,
    }, view),
  }, o));

  it('Rün Dizisi: 4 rün renk+şekil+tuş; yalnız giriş aşamasında etkin; tıklama ve 1–4 tuşları press gönderir; R tekrar', () => {
    const onInput = vi.fn();
    const { container, rerender } = render(<HackPanel snap={simon({ phase: 'show', lit: 2 })} onInput={onInput} onClose={() => {}} />);
    SIMON_SYMBOLS.forEach((s) => expect(screen.getByTestId('rune-' + s.id)).toBeDisabled());
    expect(screen.getByTestId('rune-2')).toHaveAttribute('data-lit', '1');
    expect(screen.getByTestId('simon-status')).toHaveTextContent('Tur 2 / 4');
    rerender(<HackPanel snap={simon({ phase: 'input' })} onInput={onInput} onClose={() => {}} />);
    SIMON_SYMBOLS.forEach((s) => {
      const b = screen.getByTestId('rune-' + s.id);
      expect(b).not.toBeDisabled();
      expect(b.getAttribute('aria-label')).toBe(s.name + ', tuş ' + s.key);
      expect(b.querySelector('svg')).not.toBeNull(); // şekil
    });
    fireEvent.click(screen.getByTestId('rune-1'));
    fireEvent.keyDown(container.querySelector('.klk'), { key: '3' });
    fireEvent.keyDown(container.querySelector('.klk'), { key: 'r' });
    expect(onInput.mock.calls.map((c) => c[0])).toEqual([{ op: 'press', index: 1 }, { op: 'press', index: 2 }, { op: 'replay' }]);
  });

  it('Rün Dizisi: süre çubuğu yalnız süreli kademede (progressbar), dizi metni yalnız erişilebilirlik modunda', () => {
    const { rerender } = render(<HackPanel snap={simon({ timeMax: 6, timeLeft: 3.2 })} onInput={() => {}} onClose={() => {}} />);
    const bar = screen.getByRole('progressbar', { name: 'Kalan süre' });
    expect(bar).toHaveAttribute('aria-valuenow', '4');
    expect(screen.queryByTestId('simon-seqtext')).toBeNull();
    rerender(<HackPanel snap={simon({ sequenceText: 'Kırmızı üçgen, Mavi daire' }, { accessibility: true })} onInput={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('simon-seqtext')).toHaveTextContent('Kırmızı üçgen, Mavi daire');
    expect(screen.queryByRole('progressbar', { name: 'Kalan süre' })).toBeNull();
  });

  it('Renk Kolları: kol adı + şekil + konum/hedef yazılı, bağlantı metni aria-label\'da; Çek ve Sıfırla', () => {
    const onInput = vi.fn();
    const m = createHack({ game: 'levers', seed: 5, tier: 1 });
    const view = m.view();
    const snap = base({
      game: 'levers', name: 'Renk Kolları', short: 'x', phase: 'play', how: [], view,
    });
    const { container } = render(<HackPanel snap={snap} onInput={onInput} onClose={() => {}} />);
    expect(screen.getAllByTestId(/^lever-/)).toHaveLength(4);
    const b0 = screen.getByTestId('lever-0');
    expect(b0.getAttribute('aria-label')).toContain(view.levers[0].name);
    expect(b0.getAttribute('aria-label')).toContain(view.levers[0].linkText);
    fireEvent.click(b0);
    fireEvent.keyDown(container.querySelector('.klk'), { key: '2' });
    fireEvent.click(screen.getByTestId('levers-reset'));
    expect(onInput.mock.calls.map((c) => c[0])).toEqual([{ op: 'press', index: 0 }, { op: 'press', index: 1 }, { op: 'reset' }]);
    expect(screen.getByTestId('levers-status')).toHaveTextContent('kol hedefte');
    // çözücü hamleleriyle durum güncellenir (görünüm saf makineden)
    const sol = solveLevers(m.spec);
    sol.moves.forEach((mv) => m.press(mv));
    expect(m.view().okCount).toBe(4);
  });

  it('Zar Mantığı: zar yüzü + ▲▼ + ok tuşları; ipuçları ✓/✗ yazılı; Doğrula; hak göstergesi', () => {
    const onInput = vi.fn();
    const m = createHack({ game: 'dice', seed: 9, tier: 0 });
    const view = m.view();
    const { container } = render(
      <HackPanel snap={base({ game: 'dice', name: 'Zar Mantığı', short: 'x', phase: 'play', how: [], view })} onInput={onInput} onClose={() => {}} />,
    );
    expect(screen.getByTestId('die-0')).toHaveTextContent('1');
    fireEvent.keyDown(screen.getByTestId('die-0'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByTestId('die-0'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: '1. zarı artır' }));
    fireEvent.click(screen.getByTestId('dice-submit'));
    fireEvent.keyDown(container.querySelector('.klk'), { key: '2' });
    expect(document.activeElement).toBe(screen.getByTestId('die-1'));
    expect(onInput.mock.calls.map((c) => c[0])).toEqual([
      { op: 'step', index: 0, dir: 1 }, { op: 'step', index: 0, dir: -1 }, { op: 'step', index: 0, dir: 1 }, { op: 'submit' },
    ]);
    expect(screen.getByTestId('dice-status')).toHaveTextContent('Kalan hak: 3 / 3');
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(view.clues.length);
    // anlık ✓/✗ (kademe 0): her ipucunda sr metni
    expect(container.textContent).toMatch(/sağlan/);
  });
});

describe('CSS sözleşmesi: dokunmatik hedefler ≥ 44 px, hareket azaltma', () => {
  const minOf = (sel) => {
    const re = new RegExp(sel.replace(/[.[\]]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
    const m = CSS.match(re);
    if (!m) return null;
    const h = /min-height:\s*(\d+)px/.exec(m[1]);
    return h ? Number(h[1]) : null;
  };
  it('düğme sınıfları min-height ≥ 44', () => {
    ['.klk-btn', '.klk-key', '.klk-stop', '.klh-rune', '.klh-step'].forEach((c) => {
      expect(minOf(c), c).toBeGreaterThanOrEqual(44);
    });
    expect(CSS).toMatch(/\.klh-face\s*\{[^}]*width:\s*64px[^}]*height:\s*64px/s);
  });
  it('hareket azaltma: geçişler kapatılır; strobo/yanıp sönme animasyonu yok', () => {
    expect(CSS).toMatch(/prefers-reduced-motion/);
    expect(CSS).toMatch(/data-reduced="1"/);
    expect(CSS).not.toMatch(/@keyframes/);
  });
});

describe('LockPanelHost: yoklama, girdi, kapatma', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('görüntü yoksa hiçbir şey çizmez; belirince çizer; değişince günceller; kapanınca kaldırır', () => {
    let snap = null;
    const api = { getLockPanel: () => snap, lockInput: vi.fn() };
    render(<LockPanelHost api={api} onClose={() => {}} pollMs={50} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    snap = kod();
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    snap = kod({ entered: [4] });
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByTestId('lock-slots').children[0]).toHaveTextContent('4');
    snap = null;
    act(() => vi.advanceTimersByTime(60));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('hack görüntüsü HackPanel\'e yönlenir; girdi api.lockInput\'a gider; ✕ close + onClose', () => {
    const snap = { v: 1, type: 'hack', title: 'Çözme Terminali', game: 'dice', name: 'Zar Mantığı', short: 'x', how: ['a', 'b', 'c'], phase: 'ready', status: 'bekliyor', cooldown: 0, view: null, message: '' };
    const api = { getLockPanel: () => snap, lockInput: vi.fn(() => ({ ok: true })) };
    const onClose = vi.fn();
    render(<LockPanelHost api={api} onClose={onClose} pollMs={50} />);
    fireEvent.click(screen.getByTestId('hack-start'));
    expect(api.lockInput).toHaveBeenCalledWith({ op: 'start' });
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(api.lockInput).toHaveBeenLastCalledWith({ op: 'close' });
    expect(onClose).toHaveBeenCalled();
  });

  it('api eksik/bozuksa güvenli (null)', () => {
    const { container } = render(<LockPanelHost api={{}} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('bileşen sökülünce yoklama durur', () => {
    const api = { getLockPanel: vi.fn(() => null), lockInput: vi.fn() };
    const { unmount } = render(<LockPanelHost api={api} onClose={() => {}} pollMs={50} />);
    act(() => vi.advanceTimersByTime(200));
    const n = api.getLockPanel.mock.calls.length;
    unmount();
    act(() => vi.advanceTimersByTime(500));
    expect(api.getLockPanel.mock.calls.length).toBe(n);
  });
});

describe('GERÇEK sistemle uçtan uca (cityLocks api → LockPanelHost → çözüm)', () => {
  it('düzenek kullanılır → panel çizilir → doğru kod tıklanır → kilit açılır → panel kapanır', () => {
    vi.useFakeTimers();
    const SEED = 4242;
    const b = findLockedBuilding(SEED, 'kod');
    const s = doorSides(b.it).get(b.door.id);
    const cx = b.door.x + 0.5;
    const cz = b.door.z + 0.5;
    const p = s.axis === 'x' ? { x: cx + s.sign * 1.4, y: 64, z: cz } : { x: cx, y: 64, z: cz + s.sign * 1.4 };
    const k = makeCityG(SEED, { body: p });
    k.loadAround(p.x, p.z, 30);
    k.tick(30);
    const pad = propsAround(k.pw, cx, cz, 6).find((q) => q.key === 'kod_paneli');
    k.usedProp(pad);
    const api = k.sys.api();
    render(<LockPanelHost api={api} onClose={() => {}} pollMs={50} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const sp = lockSpec(normalizeLock(b.lock), lockSeed(SEED, b.lot.id, b.lock.id));
    // yanlış: soğuma
    sp.code.forEach((v) => fireEvent.click(screen.getByRole('button', { name: 'Rakam ' + ((v % 6) + 1) })));
    fireEvent.click(screen.getByTestId('lock-submit'));
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByTestId('lock-cooldown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rakam 1' })).toBeDisabled();
    // 20 sn sonra doğru
    k.tick(60 * 21);
    act(() => vi.advanceTimersByTime(60));
    expect(screen.queryByTestId('lock-cooldown')).toBeNull();
    sp.code.forEach((v) => fireEvent.click(screen.getByRole('button', { name: 'Rakam ' + v })));
    fireEvent.click(screen.getByTestId('lock-submit'));
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByTestId('lock-solved')).toBeInTheDocument();
    k.tick(60 * 2);
    act(() => vi.advanceTimersByTime(120));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(k.G.ui).toBe('none');
    vi.useRealTimers();
  }, 30000);
});
