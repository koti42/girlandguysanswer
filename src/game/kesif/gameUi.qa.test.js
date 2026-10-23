import { describe, expect, it, vi } from 'vitest';
import { installUi } from './gameUi.js';

function rig(mode = 'macera') {
  const events = [];
  const input = { setGameplayEnabled: vi.fn(), requestPointerLock: vi.fn(), releasePointerLock: vi.fn() };
  const G = {
    mode, ui: 'none', worldReady: true, destroyed: false, paused: false,
    time: { paused: false }, player: { dead: false, cameraMode: 'fp' }, hud: { ui: 'none', cameraMode: 'fp' },
    fpState: { breaking: false }, callbacks: {}, opts: {}, settings: {}, input, quality: null, sampler: null,
    sound: vi.fn(), emit: (e) => events.push(e),
  };
  const deps = {
    loop: { restartClock: vi.fn() },
    stepper: { reset: vi.fn() },
    audioApi: { audio: { suspend: vi.fn(), resume: vi.fn() } },
    camRig: { setBase: vi.fn() },
    render: {},
    hud: { publish: vi.fn() },
  };
  const ui = installUi(G, deps);
  return { G, ui, input, events, deps };
}

describe('ui.open (api.openJournal / openUi / openPanel altyapısı)', () => {
  it('günlük: oyun sırasında açılır, girdi kapanır, sim durur; J ile kapanış closeUi/setUi(null)', () => {
    const { G, ui, input } = rig();
    expect(ui.open('journal')).toBe('journal');
    expect(G.ui).toBe('journal');
    expect(G.time.paused).toBe(true);
    expect(input.setGameplayEnabled).toHaveBeenLastCalledWith(false);
    ui.setUi(null);
    expect(G.ui).toBe('none');
    expect(G.time.paused).toBe(false);
    expect(input.setGameplayEnabled).toHaveBeenLastCalledWith(true);
  });

  it('harita ve üretim; insa modunda envanter = yapı paleti; günlük/harita yalnız macerada', () => {
    expect(rig().ui.open('map')).toBe('map');
    expect(rig().ui.open('crafting')).toBe('crafting');
    expect(rig().ui.open('craft')).toBe('crafting');
    expect(rig('insa').ui.open('inventory')).toBe('build');
    expect(rig('insa').ui.open('build')).toBe('build');
    expect(rig('insa').ui.open('journal')).toBe('none');
    expect(rig('harita').ui.open('map')).toBe('none');
    expect(rig('harita').ui.open('inventory')).toBe('none');
  });

  it('panelden panele geçer; duraklatma menüsü/ölüm/bilinmeyen ad değişmez', () => {
    const r = rig();
    r.ui.open('inventory');
    expect(r.ui.open('journal')).toBe('journal');
    expect(r.ui.open('journal')).toBe('journal'); // tekrar açmak kapatmaz
    r.ui.setUi(null);
    r.ui.open('pause');
    expect(r.G.ui).toBe('pause');
    expect(r.ui.open('journal')).toBe('pause');
    r.ui.setUi(null);
    expect(r.ui.open('yok')).toBe('none');
    r.G.player.dead = true;
    expect(r.ui.open('journal')).toBe('none');
  });

  it('dünya hazır değilken ya da yok edilmişken açmaz', () => {
    const a = rig();
    a.G.worldReady = false;
    expect(a.ui.open('journal')).toBe('none');
    const b = rig();
    b.G.destroyed = true;
    expect(b.ui.open('map')).toBe('none');
  });
});

describe('routeAction: imleç kilidi kaybı', () => {
  it('source=lock yalnız duraklatır; zaten duraklatılmışsa menüyü KAPATMAZ (çift duraklat yarışı)', () => {
    const { G, ui } = rig();
    ui.routeAction({ type: 'pause', source: 'lock' });
    expect(G.ui).toBe('pause');
    ui.routeAction({ type: 'pause', source: 'lock' });
    expect(G.ui).toBe('pause');
    // klavye Esc hâlâ geçişli
    ui.routeAction({ type: 'pause' });
    expect(G.ui).toBe('none');
  });
  it('kilit kaybı panel açıkken ya da ölüyken bir şey yapmaz', () => {
    const a = rig();
    a.ui.open('inventory');
    a.ui.routeAction({ type: 'pause', source: 'lock' });
    expect(a.G.ui).toBe('inventory');
    const b = rig();
    b.G.player.dead = true;
    b.ui.routeAction({ type: 'pause', source: 'lock' });
    expect(b.G.ui).toBe('none');
  });
});

describe('E (envanter tuşu) sandık / büyü masası / simya kazanı panelini kapatır', () => {
  it.each(['chest', 'enchant', 'brew'])('%s açıkken E: kapanır, oyun girdisi geri gelir', (name) => {
    const { G, ui, input } = rig();
    ui.setUi(name);
    expect(G.ui).toBe(name);
    input.setGameplayEnabled.mockClear();
    ui.routeAction({ type: 'inventory' });
    expect(G.ui).toBe('none');
    expect(input.setGameplayEnabled).toHaveBeenLastCalledWith(true);
  });
  it('R (üret) bu panellerde hâlâ bir şey yapmaz', () => {
    const { G, ui } = rig();
    ui.setUi('enchant');
    ui.routeAction({ type: 'craft' });
    expect(G.ui).toBe('enchant');
  });
});
