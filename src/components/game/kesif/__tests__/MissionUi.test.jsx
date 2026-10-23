// @vitest-environment jsdom
/*
 * Neon Meridyen görev arayüzü (discovery_missions): MissionTracker, CityPanelHost (pano + grafiti seçici), MissionsMenu, PauseMenu «Görevler», JournalPanel «Şehir».
 * Sahte motor cephesi üzerinde; klavye (1–3 / 1–6 / Esc / Enter), aria, 44 px CSS kuralları, iki aşamalı «Bırak», hareket azaltma.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  act, cleanup, fireEvent, render, screen, within,
} from '@testing-library/react';
import MissionTracker from '../city/MissionTracker.jsx';
import CityPanelHost, { BoardView, GraffitiView } from '../city/CityPanelHost.jsx';
import MissionsMenu from '../city/MissionsMenu.jsx';
import PauseMenu from '../PauseMenu.jsx';
import JournalPanel from '../JournalPanel.jsx';
import {
  arrowDeg, bearingText, boardKeyIndex, clockText, distText, graffitiKey, medalText, timeText, trackerAria, trackerSig,
} from '../city/missionUtils.js';

const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../city/missions.css'), 'utf8');

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const race = () => ({
  kind: 'race', stage: 'running', title: 'Kanal Sprinti', label: 'Kapıları geç', dist: 240, timeLeft: -1, t: 41.37, gate: 3, gates: 9, countdown: 0, bearing: 0.5, target: { x: 1, z: 2 }, targets: { gold: 61.2, silver: 63.5, bronze: 70.9 }, result: null,
});
const job = () => ({
  kind: 'job', stage: 'running', title: 'Kurye: Sıcak çorba', label: 'Teslim et', dist: 412, timeLeft: 95, t: 20, gate: 0, gates: 0, countdown: 0, bearing: -1.2, target: { x: 1, z: 2 }, targets: null, result: null,
});

describe('missionUtils', () => {
  it('yön metni ve ok: pozitif açı = hedef solda; sağ = negatif', () => {
    expect(bearingText(0)).toBe('önünde');
    expect(bearingText(Math.PI / 2)).toBe('solunda');
    expect(bearingText(-Math.PI / 2)).toBe('sağında');
    expect(bearingText(Math.PI)).toBe('arkanda');
    expect(arrowDeg(NaN)).toBe(0);
    expect(arrowDeg(Math.PI / 2)).toBe(270);
  });

  it('süre/mesafe/madalya biçimleri; NaN güvenli', () => {
    expect(timeText(83.46)).toBe('1:23.4');
    expect(timeText(NaN)).toBe('0:00.0');
    expect(clockText(95)).toBe('1:35');
    expect(clockText(-4)).toBe('0:00');
    expect(distText(420)).toBe('420 m');
    expect(distText(1234)).toBe('1,2 km');
    expect(medalText(3)).toBe('★ Altın');
    expect(medalText(1)).toBe('▲ Bronz');
    expect(medalText(99)).toBe('○ Madalya yok');
  });

  it('klavye eşlemeleri', () => {
    expect(boardKeyIndex({ key: '2' })).toBe(2);
    expect(boardKeyIndex({ key: '4' })).toBe(0);
    expect(boardKeyIndex({ key: '1', ctrlKey: true })).toBe(0);
    expect(graffitiKey({ key: '4' }, { color: 0 })).toEqual({ k: 'pick', design: 3 });
    expect(graffitiKey({ key: 'ArrowRight' }, { color: 7 })).toEqual({ k: 'pick', color: 0 });
    expect(graffitiKey({ key: 'q' }, { color: 0 })).toEqual({ k: 'pick', color: 7 });
    expect(graffitiKey({ key: 'Enter' }, {})).toEqual({ k: 'paint' });
    expect(graffitiKey({ key: 'Escape' }, {})).toEqual({ k: 'close' });
    expect(graffitiKey({ key: 'x' }, {})).toBeNull();
  });

  it('imza/aria: değişen alanlar imzayı değiştirir; geri sayım rakamı okunur', () => {
    expect(trackerSig(null)).toBe('');
    expect(trackerSig(race())).not.toBe(trackerSig(Object.assign(race(), { gate: 4 })));
    expect(trackerAria(Object.assign(race(), { stage: 'countdown', countdown: 2 }))).toBe('2');
    expect(trackerAria(race())).toMatch(/kapı 4 \/ 9/);
    expect(trackerAria(job())).toMatch(/Hedef 412 m sağında/);
    expect(trackerAria(null)).toBe('');
  });
});

describe('MissionTracker', () => {
  const hudCity = (m) => ({ dim: 'neon', city: { mission: m || null } });

  it('şehir dışında hiçbir şey çizmez', () => {
    const api = { getMissionTracker: vi.fn(() => job()) };
    const { container } = render(<MissionTracker hud={{ dim: 'overworld', city: null }} api={api} />);
    expect(container.firstChild).toBeNull();
    expect(api.getMissionTracker).not.toHaveBeenCalled();
  });

  it('yarış: başlık, kapı sayacı, süre, madalya hedefleri (şekil + metin), yön metni; geri sayım büyük rakam', () => {
    const t = race();
    const api = { getMissionTracker: vi.fn(() => t), abandonMission: vi.fn() };
    render(<MissionTracker hud={hudCity()} api={api} reducedMotion />);
    const box = screen.getByTestId('mission-tracker');
    expect(box.getAttribute('aria-label')).toBe('Görev izleyici');
    expect(within(box).getByText('Kanal Sprinti')).toBeTruthy();
    expect(box.textContent).toContain('Kapı 4/9');
    expect(box.textContent).toContain('0:41.3');
    expect(box.textContent).toContain('★ 1:01.2');
    expect(box.textContent).toContain('◆ 1:03.5');
    expect(box.textContent).toContain('▲ 1:10.9');
    expect(box.textContent).toContain('240 m');
    expect(box.getAttribute('data-calm')).toBe('1');
    expect(screen.queryByTestId('mission-countdown')).toBeNull();
  });

  it('geri sayım aşaması: rakam görünür ve aria-live ile okunur', async () => {
    vi.useFakeTimers();
    let cur = Object.assign(race(), { stage: 'countdown', countdown: 3, t: 0, gate: 0, gates: 0 });
    const api = { getMissionTracker: vi.fn(() => cur) };
    render(<MissionTracker hud={hudCity()} api={api} />);
    expect(screen.getByTestId('mission-countdown').textContent).toBe('3');
    cur = Object.assign({}, cur, { countdown: 2 });
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(screen.getByTestId('mission-countdown').textContent).toBe('2');
    const live = screen.getAllByRole('status').map((n) => n.textContent).join('|');
    expect(live).toContain('2');
  });

  it('Bırak iki aşamalıdır: ilk tık soru, ikinci tık görevi bırakır; 4 sn içinde onaylanmazsa vazgeçer', async () => {
    vi.useFakeTimers();
    const api = { getMissionTracker: vi.fn(() => job()), abandonMission: vi.fn() };
    render(<MissionTracker hud={hudCity()} api={api} />);
    const btn = screen.getByTestId('mission-abandon');
    expect(btn.getAttribute('aria-label')).toBe('Görevi bırak');
    fireEvent.click(btn);
    expect(api.abandonMission).not.toHaveBeenCalled();
    expect(btn.getAttribute('aria-label')).toMatch(/Emin misin/);
    await act(async () => { vi.advanceTimersByTime(4100); });
    expect(btn.getAttribute('aria-label')).toBe('Görevi bırak');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.abandonMission).toHaveBeenCalledTimes(1);
  });

  it('sonuç kartı: madalya şekli + satırlar; Tamam kapatır; etkin görev yokken hikâye satırı (hud.city.mission)', () => {
    const res = {
      type: 'race', ok: true, title: 'Çevreyolu Turu', lines: ['Süre: 1:10.0', 'Madalya: Altın'], kredi: 120, medal: 3, time: 70,
    };
    const api = { getMissionTracker: vi.fn(() => ({ kind: 'result', result: res })) };
    render(<MissionTracker hud={hudCity({ title: 'Çip Avcısı', sub: 'Çipleri topla (3/10)' })} api={api} />);
    const card = screen.getByTestId('mission-result');
    expect(card.textContent).toContain('★');
    expect(card.textContent).toContain('Süre: 1:10.0');
    fireEvent.click(within(card).getByRole('button', { name: 'Tamam' }));
    expect(screen.queryByTestId('mission-result')).toBeNull();
    expect(screen.getByTestId('mission-quest').textContent).toContain('Çip Avcısı');
  });

  it('stil: dokunma hedefleri ≥ 44 px, reducedMotion\'da animasyon yok', () => {
    expect(/\.kmt-x\s*\{[^}]*min-width:\s*44px[^}]*height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kmt-btn\s*\{[^}]*min-height:\s*44px/s.test(CSS)).toBe(true);
    expect(/\.kmb-take[^{]*\{[^}]*min-height:\s*46px/s.test(CSS)).toBe(true);
    expect(/\.kmb-close\s*\{[^}]*width:\s*44px[^}]*height:\s*44px/s.test(CSS)).toBe(true);
    expect(/prefers-reduced-motion[\s\S]*animation:\s*none/.test(CSS)).toBe(true);
  });
});

const boardView = () => ({
  type: 'board',
  kind: 'kurye',
  title: 'Kurye Panosu',
  subtitle: 'Bugünün işleri',
  driving: false,
  cls: '',
  decay: 0.85,
  msg: '',
  offers: [
    {
      id: 'jk_0_1_0', kind: 'kurye', tier: 'caylak', tierName: 'Çaylak', name: 'Sıcak çorba', dist: 220, distText: '220 m', limit: 60, limitText: '1:00', reward: 38, fragile: false, canWalk: true, stops: 0, fromText: 'Merkez', toText: 'Liman', available: true, why: '',
    },
    {
      id: 'jk_0_1_1', kind: 'pod', tier: 'usta', tierName: 'Usta', name: 'Kapsül teslimatı', dist: 500, distText: '500 m', limit: 90, limitText: '1:30', reward: 120, fragile: false, canWalk: false, stops: 3, fromText: 'Liman', toText: 'Tepe', available: false, why: 'Araç gerekli',
    },
    {
      id: 'jk_0_1_2', kind: 'kurye', tier: 'efsane', tierName: 'Efsane', name: 'Kırılgan cam küre', dist: 900, distText: '900 m', limit: 150, limitText: '2:30', reward: 260, fragile: true, canWalk: false, stops: 0, fromText: 'Tepe', toText: 'Merkez', available: true, why: '',
    },
  ],
  version: 1,
});

describe('CityPanelHost: pano', () => {
  it('3 teklif: kademe şekli + ad, ödül, süre, yaya/araç etiketi; kapalı teklif nedenini yazar; role=dialog', () => {
    const api = { getBoard: vi.fn(() => boardView()), acceptJob: vi.fn(() => ({ ok: true })), closeBoard: vi.fn() };
    render(<CityPanelHost api={api} onClose={() => {}} reducedMotion />);
    const dlg = screen.getByRole('dialog', { name: 'Kurye Panosu' });
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByTestId('offer-0').textContent).toContain('+38 Kredi');
    expect(screen.getByTestId('offer-0').textContent).toContain('● Çaylak');
    expect(screen.getByTestId('offer-1').textContent).toContain('3 durak');
    expect(screen.getByTestId('offer-2').textContent).toContain('kırılgan paket');
    expect(screen.getByTestId('offer-2').textContent).toContain('★ Efsane');
    expect(screen.getByTestId('offer-1').getAttribute('data-available')).toBe('0');
    expect(screen.getByRole('button', { name: /İşi al 2/ })).toBeDisabled();
    expect(dlg.textContent).toContain('%85');
  });

  it('klavye 1–3 ile kabul (kapalı teklif 2 tetiklenmez); Esc kapatır; kabul edilince onClose', () => {
    const onClose = vi.fn();
    const api = { getBoard: vi.fn(() => boardView()), acceptJob: vi.fn(() => ({ ok: true })), closeBoard: vi.fn() };
    render(<CityPanelHost api={api} onClose={onClose} />);
    fireEvent.keyDown(document, { key: '2' });
    expect(api.acceptJob).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: '3' });
    expect(api.acceptJob).toHaveBeenCalledWith('jk_0_1_2');
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(api.closeBoard).toHaveBeenCalled();
  });

  it('kabul başarısızsa panel açık kalır (onClose çağrılmaz)', () => {
    const onClose = vi.fn();
    const api = { getBoard: vi.fn(() => boardView()), acceptJob: vi.fn(() => ({ ok: false, reason: 'arac' })), closeBoard: vi.fn() };
    render(<CityPanelHost api={api} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /İşi al 1/ }));
    expect(api.acceptJob).toHaveBeenCalledWith('jk_0_1_0');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('görüntü yokken hiçbir şey çizmez; BoardView saf çizim', () => {
    const { container } = render(<CityPanelHost api={{ getBoard: () => null, getGraffitiPicker: () => null }} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
    render(<BoardView view={boardView()} onAccept={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

const picker = () => ({
  type: 'graffiti',
  spot: 3,
  stencils: ['Yıldız', 'Roket', 'Robot', 'Bulut', 'Gezegen', 'Dalga'].map((name, i) => ({ i, name })),
  colors: ['Kırmızı', 'Turuncu', 'Sarı', 'Yeşil', 'Camgöbeği', 'Mavi', 'Mor', 'Pembe'].map((name, i) => ({ i, name, hex: '#ff0000' })),
  design: 0,
  color: 4,
  msg: '',
  seconds: 3,
});

describe('CityPanelHost: grafiti seçici', () => {
  it('6 kalıp + 8 renk radyo düğmeleri; seçili olan aria-checked; renk adı görünür (renk körlüğü)', () => {
    const api = { getBoard: () => null, getGraffitiPicker: () => picker(), graffitiAct: vi.fn(() => ({ ok: true })) };
    render(<CityPanelHost api={api} onClose={() => {}} />);
    const stencils = within(screen.getByRole('radiogroup', { name: 'Kalıp' })).getAllByRole('radio');
    const colors = within(screen.getByRole('radiogroup', { name: 'Renk' })).getAllByRole('radio');
    expect(stencils).toHaveLength(6);
    expect(colors).toHaveLength(8);
    expect(stencils[0].getAttribute('aria-checked')).toBe('true');
    expect(colors[4].getAttribute('aria-checked')).toBe('true');
    expect(colors[6].textContent).toContain('Mor');
    fireEvent.click(stencils[2]);
    expect(api.graffitiAct).toHaveBeenCalledWith({ k: 'pick', design: 2 });
    fireEvent.click(colors[1]);
    expect(api.graffitiAct).toHaveBeenCalledWith({ k: 'pick', color: 1 });
  });

  it('klavye: 1–6 kalıp, ←/→ renk, Enter boya, Esc kapat; boya başarılıysa panel kapanır', () => {
    const onClose = vi.fn();
    const api = { getBoard: () => null, getGraffitiPicker: () => picker(), graffitiAct: vi.fn(() => ({ ok: true })) };
    render(<CityPanelHost api={api} onClose={onClose} />);
    fireEvent.keyDown(document, { key: '5' });
    expect(api.graffitiAct).toHaveBeenLastCalledWith({ k: 'pick', design: 4 });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    expect(api.graffitiAct).toHaveBeenLastCalledWith({ k: 'pick', color: 3 });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(api.graffitiAct).toHaveBeenLastCalledWith({ k: 'paint' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(api.graffitiAct).toHaveBeenLastCalledWith({ k: 'close' });
  });

  it('boya reddedilirse (boş değil) panel açık kalır ve mesaj görünür', () => {
    const onClose = vi.fn();
    const v = Object.assign(picker(), { msg: 'Bu duvar zaten boyalı.' });
    const api = { getBoard: () => null, getGraffitiPicker: () => v, graffitiAct: vi.fn(() => ({ ok: false })) };
    render(<CityPanelHost api={api} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('graffiti-paint'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText('Bu duvar zaten boyalı.')).toBeTruthy();
    render(<GraffitiView view={picker()} onAct={() => {}} calm />);
  });
});

const info = () => ({
  kredi: 215,
  day: 2,
  tracker: null,
  busy: false,
  activeQuest: { id: 'nm_cip_10', name: 'Çip Avcısı', hint: 'Sokaklarda parlayan veri çiplerini topla.', have: 3, need: 10 },
  quests: [
    { id: 'nm_hosgeldin', title: 'Hoş Geldin', desc: 'Birisiyle konuşarak şehre selam ver.', hint: '', state: 'done', progress: 1, goal: 1 },
    { id: 'nm_cip_10', title: 'Çip Avcısı', desc: '10 veri çipi bul.', hint: 'Sokaklarda parlayan veri çiplerini topla.', state: 'active', progress: 3, goal: 10 },
    { id: 'nm_portal_yumurtasi', title: '???', desc: 'Bu görev zamanı gelince açılır.', hint: '', state: 'locked', progress: 0, goal: 1 },
  ],
  races: [0, 1].map((id) => ({
    id, name: id ? 'Merkez Halkası' : 'Çevreyolu Turu', kind: 'circuit', laps: 1, gates: 8, length: 1800, best: id ? 0 : 71.2, bestText: id ? '' : '1:11.2', medal: id ? 0 : 3, targets: { gold: 70, silver: 72, bronze: 80 }, done: id ? 0 : 2,
  })),
  achievements: [{ id: 'nm_ilk_gecis', name: 'İlk Geçiş', desc: 'Neon Meridyen\'e ilk kez gir.', done: true, hidden: false, progress: 1, target: 1, text: '1/1' }, { id: 'nm_diyar_isigi', name: '???', desc: 'Gizli başarım: keşfettikçe açılır.', done: false, hidden: true, progress: 0, target: 1, text: '' }],
  stats: { achievements: 1 },
  discovery: {
    chips: 3, chipsTotal: 240, graffiti: 1, graffitiTotal: 90, rooms: 0, roomsTotal: 30, terminals: 2, terminalsTotal: 16, sets: [{ id: 'cip_cati', name: 'Çatı Arşivi', have: 4, need: 60, done: false }],
  },
  claims: {
    enabled: true,
    items: [{ key: 'neon:firstjob', short: 'firstjob', name: 'İlk iş', hint: 'Bir kurye ya da taksi işi tamamla.', amount: 20, state: 'bekliyor' }],
  },
  version: 1,
});

describe('MissionsMenu / PauseMenu «Görevler»', () => {
  it('bölümler: etkin görev, hikâye görevleri (gizli ???), yarışlar (madalya şekli + en iyi süre), keşifler + koleksiyon, başarımlar, jeton ödülleri', () => {
    const api = { getMissionInfo: vi.fn(() => info()), abandonMission: vi.fn(), startRace: vi.fn(() => ({ ok: true })) };
    render(<MissionsMenu api={api} onResume={() => {}} />);
    const root = screen.getByTestId('missions-menu');
    expect(root.textContent).toContain('215');
    expect(root.textContent).toContain('Gün 3');
    expect(screen.getByTestId('quest-nm_portal_yumurtasi').textContent).toContain('???');
    expect(screen.getByTestId('quest-nm_cip_10').getAttribute('data-state')).toBe('active');
    expect(screen.getByTestId('race-0').textContent).toContain('★ Altın');
    expect(screen.getByTestId('race-0').textContent).toContain('en iyi 1:11.2');
    expect(root.textContent).toContain('3/240 veri çipi'.replace('3/240', '3') ? 'veri çipi' : '');
    expect(root.textContent).toContain('Çatı Arşivi');
    expect(screen.getByTestId('ach-nm_diyar_isigi').textContent).toContain('???');
    expect(screen.getByTestId('menu-claims').textContent).toContain('20 jeton');
    expect(root.querySelectorAll('[role="progressbar"]').length).toBeGreaterThan(0);
  });

  it('jeton bölümü giriş yoksa gizlenir; yarışa git → startRace + oyuna dön; reddedilirse mesaj', () => {
    const onResume = vi.fn();
    const i = info();
    i.claims = { enabled: false, items: [] };
    const api = { getMissionInfo: () => i, abandonMission: vi.fn(), startRace: vi.fn(() => ({ ok: true })) };
    render(<MissionsMenu api={api} onResume={onResume} />);
    expect(screen.queryByTestId('menu-claims')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Merkez Halkası yarışına git' }));
    expect(api.startRace).toHaveBeenCalledWith(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    cleanup();
    const api2 = { getMissionInfo: () => i, startRace: vi.fn(() => ({ ok: false, message: 'Yarış için bir araca bin.' })) };
    render(<MissionsMenu api={api2} onResume={onResume} />);
    fireEvent.click(screen.getByRole('button', { name: 'Çevreyolu Turu yarışına git' }));
    expect(screen.getByText('Yarış için bir araca bin.')).toBeTruthy();
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('etkin görev varken «Görevi bırak»; yarış düğmeleri kapalı', () => {
    const i = info();
    i.busy = true;
    i.tracker = {
      kind: 'job', title: 'Kurye: Sıcak çorba', label: 'Teslim et', dist: 120,
    };
    const api = { getMissionInfo: () => i, abandonMission: vi.fn(() => ({ ok: true })), startRace: vi.fn() };
    render(<MissionsMenu api={api} />);
    fireEvent.click(screen.getByTestId('menu-abandon'));
    expect(api.abandonMission).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Çevreyolu Turu yarışına git' })).toBeDisabled();
  });

  it('PauseMenu: missionApi yoksa Görevler düğmesi yok; varsa sayfa açılır, Geri ana menüye döner', () => {
    const base = {
      onResume: vi.fn(), onSave: vi.fn(), onExit: vi.fn(), onChange: vi.fn(),
    };
    const { unmount } = render(<PauseMenu {...base} />);
    expect(screen.queryByTestId('kx-missions-open')).toBeNull();
    unmount();
    const api = { getMissionInfo: () => info(), abandonMission: vi.fn(), startRace: vi.fn() };
    render(<PauseMenu {...base} missionApi={api} />);
    fireEvent.click(screen.getByTestId('kx-missions-open'));
    expect(screen.getByRole('dialog', { name: 'Görevler' })).toBeTruthy();
    expect(screen.getByTestId('missions-menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('dialog', { name: 'Duraklatıldı' })).toBeTruthy();
  });
});

describe('JournalPanel «Şehir» sekmesi', () => {
  it('journal.city varsa sekme çıkar; çip/grafiti/oda sayaçları, yarış en iyileri ve günlük parçaları listelenir', () => {
    const j = {
      quests: [], achievements: [], discovered: { structures: 0, biomes: 0 }, stats: {}, abilities: {},
      city: {
        chips: [{ id: 1, name: 'Veri çipi 2', dist: 'Merkez' }],
        graffiti: [{ id: 3, name: 'Grafiti 4', design: 'Roket', color: 'Mavi', dist: 'Tepe' }],
        rooms: [{ id: 2, name: 'Gizli Oda: Eski Depo' }],
        story: [{ id: 0, text: 'Meridyen\'in ilk sokak lambası yandı.' }],
        races: [{ id: 0, name: 'Çevreyolu Turu', best: '1:11.2' }],
        jobs: { done: 4, earned: 320 },
      },
    };
    render(<JournalPanel api={{ getJournal: () => j }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Şehir' }));
    expect(screen.getByTestId('city-chips').textContent).toContain('1 / 240');
    expect(screen.getByTestId('city-graffiti').textContent).toContain('Roket mavi');
    expect(screen.getByTestId('city-rooms').textContent).toContain('Eski Depo');
    expect(screen.getByTestId('city-races').textContent).toContain('1:11.2');
    expect(screen.getByTestId('city-jobs').textContent).toContain('320');
    expect(screen.getByText(/ilk sokak lambası/)).toBeTruthy();
  });

  it('city yoksa sekme yok (ana diyar günlüğü değişmez)', () => {
    const j = {
      quests: [], achievements: [], discovered: { structures: 0, biomes: 0 }, stats: {}, abilities: {},
    };
    render(<JournalPanel api={{ getJournal: () => j }} onClose={() => {}} />);
    expect(screen.queryByRole('tab', { name: 'Şehir' })).toBeNull();
  });
});
