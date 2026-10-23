// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: (k) => 'data:image/png;base64,' + k.length }));

import KesifHud from '../KesifHud.jsx';
import { createHudStore } from '../../../../game/kesif/hudStore.js';
import { createAnnouncer } from '../kesifAnnouncer.js';

const hotbar = (extra = []) => [{ item: 'item:kazma_demir', count: 1, dur: 0.5 }, { item: 'item:yay', count: 1 }, ...extra];

function setup(props = {}, initial = {}) {
  const store = createHudStore();
  store.set({ hp: 20, maxHp: 20, hunger: 20, hotbar: hotbar(), ...initial });
  const actions = { selectHotbar: vi.fn(), resume: vi.fn(), save: vi.fn(() => true), exit: vi.fn(), respawn: vi.fn(), pressButton: vi.fn() };
  const utils = render(<KesifHud store={store} actions={actions} {...props} />);
  return { store, actions, ...utils };
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // yok say
  }
});
afterEach(() => {
  vi.useRealTimers();
});

describe('KesifHud: mağaza güdümlü güncellemeler', () => {
  it('can, açlık ve eşya çubuğu depo değişince güncellenir', () => {
    const { store } = setup();
    expect(screen.getByRole('meter', { name: 'Can' })).toHaveAttribute('aria-valuenow', '20');
    expect(screen.getByRole('meter', { name: 'Açlık' })).toHaveAttribute('aria-valuenow', '20');
    act(() => {
      store.patch({ hp: 7, hunger: 11 });
    });
    expect(screen.getByRole('meter', { name: 'Can' })).toHaveAttribute('aria-valuetext', '7 / 20');
    expect(screen.getByRole('meter', { name: 'Açlık' })).toHaveAttribute('aria-valuenow', '11');
    act(() => {
      store.patch({ selected: 1 });
    });
    expect(screen.getByRole('button', { name: '2. yuva: Yay' })).toHaveAttribute('aria-pressed', 'true');
    act(() => {
      store.patch({ hotbar: hotbar([{ item: 'blok:taş', count: 12 }]) });
    });
    expect(screen.getByRole('button', { name: /3\. yuva: Taş, 12 adet/ })).toBeInTheDocument();
  });

  it('yarım kalp: 7 can = 3 dolu + 1 yarım', () => {
    const { container } = setup({}, { hp: 7 });
    const hearts = Array.from(container.querySelectorAll('.kx-heart')).map((h) => h.getAttribute('data-state'));
    expect(hearts.slice(0, 5)).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });

  it('oksijen yalnızca su altındayken ya da azalmışken görünür', () => {
    const { store } = setup();
    expect(screen.queryByRole('meter', { name: 'Oksijen' })).toBeNull();
    act(() => {
      store.patch({ underwater: true, oxygen: 15 });
    });
    expect(screen.getByRole('meter', { name: 'Oksijen' })).toBeInTheDocument();
    act(() => {
      store.patch({ underwater: false, oxygen: 9 });
    });
    expect(screen.getByRole('meter', { name: 'Oksijen' })).toHaveAttribute('aria-valuenow', '9');
    act(() => {
      store.patch({ oxygen: 15 });
    });
    expect(screen.queryByRole('meter', { name: 'Oksijen' })).toBeNull();
  });

  it('hotbar yuvasına tıklama actions.selectHotbar çağırır; yoksa pressButton(hotbarN)', () => {
    const { actions, rerender, store } = setup();
    fireEvent.click(screen.getByRole('button', { name: '2. yuva: Yay' }));
    expect(actions.selectHotbar).toHaveBeenCalledWith(1);
    rerender(<KesifHud store={store} actions={{ pressButton: actions.pressButton }} />);
    fireEvent.click(screen.getByRole('button', { name: '2. yuva: Yay' }));
    expect(actions.pressButton.mock.calls.slice(-2)).toEqual([
      ['hotbar2', true],
      ['hotbar2', false],
    ]);
  });
});

describe('KesifHud: artı imleç, hedef ve ipucu', () => {
  it('hedef blok adı ve kırma ilerlemesi; uzak menzilli silahta imleç değişir', () => {
    const { store, container } = setup();
    const cross = () => container.querySelector('.kx-cross');
    expect(cross()).toHaveAttribute('data-mode', 'idle');
    act(() => {
      store.patch({ target: { block: 3, name: 'Meşe Kütüğü', progress: 0.4 } });
    });
    expect(cross()).toHaveAttribute('data-mode', 'target');
    expect(screen.getByText('Meşe Kütüğü')).toBeInTheDocument();
    expect(container.querySelector('.kx-cross-prog')).not.toBeNull();
    act(() => {
      store.patch({ selected: 1 }); // yay
    });
    expect(cross()).toHaveAttribute('data-mode', 'ranged');
    act(() => {
      store.patch({ target: { block: null, name: null, progress: 0 }, selected: 0 });
    });
    expect(cross()).toHaveAttribute('data-mode', 'idle');
    expect(container.querySelector('.kx-cross-prog')).toBeNull();
  });

  it('ipucu satırı: masaüstünde tuş, dokunmatikte tuşsuz + Etkileş düğmesi', () => {
    const { store, container } = setup({}, { hint: "[E] Kol'u çek" });
    expect(container.querySelector('.kx-kbd')).toHaveTextContent('E');
    expect(screen.getByText("Kol'u çek")).toBeInTheDocument();
    act(() => store.patch({ hint: null }));
    expect(container.querySelector('.kx-hint')).toBeNull();

    const t = setup({ touch: true }, { hint: "[E] Kol'u çek" });
    expect(t.container.querySelector('.kx-kbd')).toBeNull();
    expect(within(t.container).getByRole('button', { name: 'Etkileş' })).toBeInTheDocument();
  });

  it('elde tutulan eşya adı değişince kısa süre görünür', () => {
    vi.useFakeTimers();
    const { store, container } = setup({}, { held: null });
    expect(container.querySelector('.kx-held')).toBeNull();
    act(() => store.patch({ held: 'item:yay' }));
    expect(container.querySelector('.kx-held')).toHaveTextContent('Yay');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.querySelector('.kx-held')).toBeNull();
  });
});

describe('KesifHud: bilgi çipi, görev, boss, parkur', () => {
  it('bölge, biyom, saat ve koordinatlar', () => {
    setup({}, { zone: { id: 1, name: 'Fısıldayan Ormanlar' }, biome: 'Orman', time: 'gece', coords: { x: 12.4, y: 64, z: -30.6 } });
    const grp = screen.getByRole('group', { name: 'Konum bilgisi' });
    expect(grp).toHaveTextContent('Fısıldayan Ormanlar');
    expect(grp).toHaveTextContent('Orman');
    expect(grp).toHaveTextContent('gece');
    expect(grp).toHaveTextContent('X 12');
    expect(grp).toHaveTextContent('Z −31');
  });

  it('görev izleyici depodan; boss barı belirir ve kaybolur', () => {
    const { store } = setup({}, { quest: { title: 'Kazma yap', lines: ['Ağaç kes'] } });
    expect(screen.getByRole('region', { name: 'Görev izleyici' })).toHaveTextContent('Kazma yap');
    expect(screen.queryByRole('progressbar')).toBeNull();
    act(() => store.patch({ boss: { name: 'Taş Bekçi', hp: 80, maxHp: 100 } }));
    expect(screen.getByRole('progressbar', { name: 'Taş Bekçi canı' })).toHaveAttribute('aria-valuenow', '80');
    act(() => store.patch({ boss: null }));
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('görev ipucu düğmesi yalnız getPuzzleHint eylemi varsa', () => {
    const getPuzzleHint = vi.fn(() => 'Kolu çek.');
    setup({ actions: { getPuzzleHint } }, { quest: { title: 'Bulmaca', lines: [] } });
    fireEvent.click(screen.getByRole('button', { name: /İpucu/ }));
    expect(getPuzzleHint).toHaveBeenCalled();
    expect(screen.getByText('Kolu çek.')).toBeInTheDocument();
  });

  it('parkur sayacı kademe, süre ve kontrol noktası gösterir', () => {
    setup({}, { parkour: { timer: 83.456, checkpoint: 2, difficulty: 3 } });
    const grp = screen.getByRole('group', { name: 'Parkur, Altın kademe' });
    expect(grp).toHaveTextContent('1:23.45');
    expect(grp).toHaveTextContent('Kontrol noktası 2');
  });

  it('yetenekler masaüstünde simge; dokunmatikte çubuk yok', () => {
    const { container } = setup({ info: { abilityStatus: { portalGun: { cooldown: 0.4, charges: 1, max: 3 } } } }, { abilities: { doubleJump: true, portalGun: true } });
    const list = screen.getByRole('list', { name: 'Yetenekler' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(container.querySelector('.kx-ab-cd')).not.toBeNull();
    expect(container.querySelectorAll('.kx-ab-pips i')).toHaveLength(3);
    const t = setup({ touch: true }, { abilities: { doubleJump: true } });
    expect(within(t.container).queryByRole('list', { name: 'Yetenekler' })).toBeNull();
  });

  it('durum hapları: inşa modu ve uçuş', () => {
    setup({}, { mode: 'insa', flying: true });
    expect(screen.getByText('İnşa Modu')).toBeInTheDocument();
    expect(screen.getByText('Uçuş')).toBeInTheDocument();
  });
});

describe('KesifHud: hasar vinyeti ve duyurular', () => {
  it('can düşünce vinyet ve onHurt tetiklenir; iyileşmede tetiklenmez', () => {
    const onHurt = vi.fn();
    const { store, container } = setup({ onHurt });
    expect(container.querySelector('.kx-vignette-hit')).toBeNull();
    act(() => store.patch({ hp: 14 }));
    expect(container.querySelector('.kx-vignette-hit')).not.toBeNull();
    expect(onHurt).toHaveBeenCalledWith({ lost: 6, hp: 14 });
    act(() => store.patch({ hp: 18 }));
    expect(onHurt).toHaveBeenCalledTimes(1);
  });

  it('can azken kalıcı vinyet ve ekran okuyucu uyarısı', () => {
    const { store, container } = setup();
    act(() => store.patch({ hp: 4 }));
    expect(container.querySelector('.kx-vignette')).toHaveAttribute('data-low', '1');
    expect(screen.getByText('Canın azaldı.')).toBeInTheDocument();
  });

  it('bölge duyurusu hud.banner ile; süresi dolunca kalkar', () => {
    vi.useFakeTimers();
    const { store } = setup();
    act(() => store.patch({ banner: { text: 'Yanık Kanyonlar', sub: 'Sıcak ve kurak', until: Date.now() + 3000 } }));
    expect(screen.getByRole('heading', { name: 'Yanık Kanyonlar' })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByRole('heading', { name: 'Yanık Kanyonlar' })).toBeNull();
  });

  it('announcer kuyruğu bildirim yığınında görünür ve süresi dolunca kalkar', () => {
    vi.useFakeTimers();
    const announcer = createAnnouncer();
    setup({ announcer });
    act(() => {
      announcer.push({ type: 'achievement', title: 'İlk Adım' });
      announcer.push({ type: 'puzzleSolved', puzzleType: 'terazi' });
    });
    expect(screen.getByText('Başarım kazandın')).toBeInTheDocument();
    expect(screen.getByText('Bulmaca çözüldü')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(5400);
    });
    expect(screen.queryByText('Başarım kazandın')).toBeNull();
    expect(announcer.get()).toHaveLength(0);
  });
});

describe('KesifHud: arayüz durumları ve katmanlar', () => {
  it('panel açıkken oyun katmanı inert olur; kapanınca geri gelir', () => {
    const { store, container } = setup();
    const layer = container.querySelector('.kx-layer');
    expect(layer.hasAttribute('inert')).toBe(false);
    act(() => store.patch({ ui: 'inventory' }));
    expect(layer.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-ui', 'inventory');
    act(() => store.patch({ ui: 'none' }));
    expect(layer.hasAttribute('inert')).toBe(false);
  });

  it('pause → PauseMenu, dead → DeathScreen, victory → VictoryScreen', () => {
    const { store, actions } = setup({
      info: { worldCode: 'ABCD1234', deathInfo: { cause: 'fall' }, lostCount: 3, victoryStats: { playTime: 3600, mobsKilled: 41 }, worldName: 'Deneme' },
      settings: { easy: false },
    });
    act(() => store.patch({ ui: 'pause' }));
    expect(screen.getByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Devam et/ }));
    expect(actions.resume).toHaveBeenCalled();

    act(() => store.patch({ ui: 'dead' }));
    expect(screen.getByRole('dialog', { name: 'Bitkin düştün' })).toHaveTextContent('Çok yüksekten düştün.');

    act(() => store.patch({ ui: 'victory' }));
    const win = screen.getByRole('dialog', { name: 'Dünya Fethedildi' });
    expect(win).toHaveTextContent('1 sa 0 dk');
    expect(win).toHaveTextContent('41');
  });

  it('harita modunda reportMap verilirse duraklatma menüsünde "Haritayı raporla" çıkar; diğer modlarda çıkmaz', async () => {
    const reportMap = vi.fn(() => Promise.resolve(true));
    const a = { resume: vi.fn(), exit: vi.fn(), reportMap };
    const harita = setup({ actions: a }, { mode: 'harita' });
    act(() => harita.store.patch({ ui: 'pause' }));
    fireEvent.click(screen.getByRole('button', { name: /Haritayı raporla/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Şiddet/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Gönder$/ }));
    await waitFor(() => expect(reportMap).toHaveBeenCalledWith('siddet'));
    harita.unmount();

    const macera = setup({ actions: a }, { mode: 'macera' });
    act(() => macera.store.patch({ ui: 'pause' }));
    expect(screen.queryByRole('button', { name: /Haritayı raporla/ })).toBeNull();
  });

  it('overlays=false iken katmanları çizmez', () => {
    const { store } = setup({ overlays: false });
    act(() => store.patch({ ui: 'pause' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ayar değişimi actions.changeSettings ve (yerleşim için) input.setSettings çağırır', () => {
    const changeSettings = vi.fn();
    const input = { setSettings: vi.fn() };
    const { store } = setup({ actions: { changeSettings, resume: vi.fn() }, inputRef: { current: input }, touch: true, settings: {} });
    act(() => store.patch({ ui: 'pause' }));
    fireEvent.click(screen.getByRole('button', { name: /Ayarlar/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'Sol elli düzen' }));
    return Promise.resolve().then(() => {
      expect(changeSettings).toHaveBeenCalledWith({ leftHanded: true });
      expect(input.setSettings).toHaveBeenCalledWith({ leftHanded: true });
    });
  });

  it('jiroskop açılırken input.enableGyro çağrılır ve sonuç yamaya yazılır', async () => {
    const changeSettings = vi.fn();
    const enableGyro = vi.fn(() => Promise.resolve(false));
    const { store } = setup({ actions: { changeSettings }, inputRef: { current: { enableGyro } }, touch: true });
    act(() => store.patch({ ui: 'pause' }));
    fireEvent.click(screen.getByRole('button', { name: /Ayarlar/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('switch', { name: 'Jiroskopla bak' }));
    });
    expect(enableGyro).toHaveBeenCalledWith(true);
    expect(changeSettings).toHaveBeenCalledWith({ gyro: false });
  });

  it('dokunmatik kontroller yalnız touch ve oyun durumunda', () => {
    const { store, rerender, actions } = setup();
    expect(screen.queryByRole('group', { name: 'Eylem düğmeleri' })).toBeNull();
    rerender(<KesifHud store={store} actions={actions} touch />);
    expect(screen.getByRole('group', { name: 'Eylem düğmeleri' })).toBeInTheDocument();
    act(() => store.patch({ ui: 'map' }));
    expect(screen.queryByRole('group', { name: 'Eylem düğmeleri' })).toBeNull();
  });

  it('erişilebilirlik ayarı kök öznitelikte', () => {
    const { container } = setup({ settings: { accessibility: true } });
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-a11y', '1');
  });

  it('hata ayıklamada FPS düğmesi çipi açar', () => {
    const { container } = setup({ debug: true }, { fps: 58 });
    expect(container.querySelector('.kx-fps')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'FPS' }));
    expect(container.querySelector('.kx-fps')).toHaveTextContent('58 FPS');
  });

  it('getMapInfo verilirse mini harita çizilir (masaüstünde img, dokunmatikte düğme)', () => {
    const getMapInfo = vi.fn(() => null);
    const proto = HTMLCanvasElement.prototype;
    const orig = proto.getContext;
    proto.getContext = () => null;
    try {
      const d = setup({ getMapInfo });
      expect(within(d.container).getByRole('img', { name: /Mini harita/ })).toBeInTheDocument();
      const openMap = vi.fn();
      const t = setup({ getMapInfo, touch: true, actions: { openMap } });
      fireEvent.click(within(t.container).getByRole('button', { name: /Mini harita/ }));
      expect(openMap).toHaveBeenCalled();
    } finally {
      proto.getContext = orig;
    }
  });
});
