// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: (k) => 'data:image/png;base64,' + k.length }));

import ManaBar from '../ManaBar.jsx';
import SpellCooldown from '../SpellCooldown.jsx';
import StatusEffects from '../StatusEffects.jsx';
import Hotbar from '../Hotbar.jsx';
import KesifHud from '../KesifHud.jsx';
import { createHudStore } from '../../../../game/kesif/hudStore.js';

const spell = (o = {}) => ({
  key: 'ates_topu', name: 'Ateş Topu', manaCost: 12, cooldown01: 0, ready: true, ...o,
});
const fx = (o = {}) => ({
  key: 'hiz', name: 'Hız', icon: 'hiz', level: 1, secondsLeft: 125, fraction: 0.7, ...o,
});

describe('ManaBar', () => {
  it('azami mana 0 (insa/harita) ya da dolu ve asa yok ise görünmez', () => {
    const { container, rerender } = render(<ManaBar mana={{ value: 0, max: 0 }} spell={null} />);
    expect(container.firstChild).toBeNull();
    rerender(<ManaBar mana={{ value: 100, max: 100 }} spell={null} />);
    expect(container.firstChild).toBeNull();
    rerender(<ManaBar mana={{ value: 60, max: 100 }} spell={null} />);
    expect(screen.getByRole('meter', { name: 'Mana' })).toHaveAttribute('aria-valuenow', '60');
  });

  it('asa eldeyken dolu olsa da görünür; kaç büyü yetecek; bedel işareti', () => {
    render(<ManaBar mana={{ value: 100, max: 100 }} spell={spell()} />);
    const bar = screen.getByTestId('mana-bar');
    expect(bar).toHaveTextContent('100');
    expect(bar).toHaveTextContent('8×');
    expect(bar.querySelector('.kx-mana-mark').style.left).toBe('12%');
    expect(screen.getByTestId('spell-cooldown')).toBeInTheDocument(); // büyü halkası aynı satırda
  });

  it('mana bedelden azsa uyarı durumu, "Yetersiz" etiketi ve erişilebilir metin', () => {
    render(<ManaBar mana={{ value: 5, max: 100 }} spell={spell({ ready: false })} />);
    expect(screen.getByTestId('mana-bar')).toHaveAttribute('data-short', '1');
    expect(screen.getByTestId('mana-bar')).toHaveTextContent('Yetersiz');
    expect(screen.getByRole('meter', { name: 'Mana' }).getAttribute('aria-valuetext')).toMatch(/yetersiz/);
  });

  it('değer sınırlanır (taşan/negatif)', () => {
    const { rerender } = render(<ManaBar mana={{ value: 500, max: 100 }} spell={spell()} />);
    expect(screen.getByRole('meter', { name: 'Mana' })).toHaveAttribute('aria-valuenow', '100');
    rerender(<ManaBar mana={{ value: -4, max: 100 }} spell={spell()} />);
    expect(screen.getByRole('meter', { name: 'Mana' })).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('SpellCooldown', () => {
  it('durumlar: hazır / bekliyor / mana yok; halka derecesi kalan orana göre', () => {
    const { rerender } = render(<SpellCooldown spell={spell()} />);
    const el = () => screen.getByTestId('spell-cooldown');
    expect(el()).toHaveAttribute('data-state', 'ready');
    expect(el().getAttribute('aria-label')).toBe('Ateş Topu, 12 mana, Hazır');
    rerender(<SpellCooldown spell={spell({ cooldown01: 0.5, ready: false })} />);
    expect(el()).toHaveAttribute('data-state', 'cd');
    expect(el().style.getPropertyValue('--kx-spell-left')).toBe('180deg');
    rerender(<SpellCooldown spell={spell({ ready: false })} />);
    expect(el()).toHaveAttribute('data-state', 'mana');
    expect(el().getAttribute('aria-label')).toMatch(/Mana yetersiz/);
  });

  it('büyü yoksa hiçbir şey çizmez', () => {
    const { container } = render(<SpellCooldown spell={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('StatusEffects', () => {
  it('her etki simge + süre + seviye rozeti; etiket "Hız II, 2:05 kaldı"', () => {
    render(<StatusEffects effects={[fx({ level: 2 }), fx({ key: 'gece_gorusu', name: 'Gece Görüşü', icon: 'goz', secondsLeft: 8, fraction: 0.1 })]} />);
    const list = screen.getByRole('list', { name: 'Aktif etkiler' });
    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].getAttribute('aria-label')).toBe('Hız II, 2:05 kaldı');
    expect(items[0].querySelector('.kx-fx-lvl').textContent).toBe('2');
    expect(items[0].textContent).toContain('2:05');
    // simge şekilleri farklı (renge ek olarak şekil)
    expect(items[0].querySelector('path').getAttribute('d')).not.toBe(items[1].querySelector('path').getAttribute('d'));
    expect(items[1]).toHaveAttribute('data-ending', '1'); // son 10 sn
    expect(items[0]).toHaveAttribute('data-ending', '0');
  });

  it('hareket azaltmada son-saniye soluklaşması kapalı; etki yoksa çizilmez; bilinmeyen simge kalp yoluna düşer', () => {
    const { container, rerender } = render(<StatusEffects effects={[fx({ secondsLeft: 3 })]} calm />);
    expect(container.querySelector('li')).toHaveAttribute('data-ending', '0');
    rerender(<StatusEffects effects={[]} />);
    expect(container.firstChild).toBeNull();
    rerender(<StatusEffects effects={[fx({ icon: 'bilinmeyen' })]} />);
    expect(container.querySelector('path')).toBeTruthy();
  });
});

describe('Hotbar: büyülü eşya', () => {
  it('büyülü yuvada parıltı katmanı, etiket ve data-ench; büyüsüzde yok', () => {
    const slots = [{ item: 'item:kılıç_demir', count: 1, ench: 2, icon: 'data:image/png;base64,AA' }, { item: 'item:kazma_demir', count: 1 }];
    const { container } = render(<Hotbar slots={slots} selected={0} onSelect={() => {}} />);
    const first = container.querySelector('[data-index="0"]');
    expect(first).toHaveAttribute('data-ench', '1');
    expect(first.querySelector('.kx-slot-glint')).toBeTruthy();
    expect(first.getAttribute('aria-label')).toMatch(/büyülü \(2 büyü\)/);
    const second = container.querySelector('[data-index="1"]');
    expect(second).toHaveAttribute('data-ench', '0');
    expect(second.querySelector('.kx-slot-glint')).toBeNull();
  });
});

describe('KesifHud: büyü HUD entegrasyonu', () => {
  const base = { hp: 20, maxHp: 20, hunger: 20, hotbar: [{ item: 'item:asa_ates', count: 1 }] };

  it('mana çubuğu, büyü halkası ve etkiler depodan gelir; insa/harita (mana 0) gizli', () => {
    const store = createHudStore();
    store.set({
      ...base,
      mana: { value: 70, max: 100 },
      spell: spell(),
      effects: [fx()],
    });
    render(<KesifHud store={store} actions={{}} />);
    expect(screen.getByTestId('mana-bar')).toBeInTheDocument();
    expect(screen.getByTestId('spell-cooldown')).toBeInTheDocument();
    expect(screen.getByTestId('status-effects')).toBeInTheDocument();
    act(() => {
      store.patch({ mana: { value: 0, max: 0 }, spell: null, effects: [] });
    });
    expect(screen.queryByTestId('mana-bar')).toBeNull();
    expect(screen.queryByTestId('status-effects')).toBeNull();
  });

  it('panel açıkken (enchant/brew) HUD etkileşime kapanır ama bozulmaz', () => {
    const store = createHudStore();
    store.set({ ...base, ui: 'enchant', mana: { value: 70, max: 100 }, effects: [fx()] });
    const { container } = render(<KesifHud store={store} actions={{}} />);
    expect(container.querySelector('.kx-root')).toHaveAttribute('data-ui', 'enchant');
  });
});
