// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({
    renderItemIcon: () => 'data:image/png;base64,AAAA',
}));

import { EnergyChip, ScannerRadar, TechStrip } from '../TechHud.jsx';
import Hotbar from '../Hotbar.jsx';
import PanelItemInfo from '../PanelItemInfo.jsx';
import PanelSlot from '../PanelSlot.jsx';
import KesifHud from '../KesifHud.jsx';
import { createHudStore } from '../../../../game/kesif/hudStore.js';

const JET = {
    fuel: 610, max: 1000, fraction: 0.61, empty: false, cells: 3, thrusting: false,
};

describe('TechStrip', () => {
    it('hiçbir cihaz yoksa çizilmez', () => {
        const { container } = render(<TechStrip jetpack={null} charge={null} shield={null} portals={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('jetpack: yakıt çubuğu yüzde + hücre sayısı; metin eşdeğeri (renk körlüğü)', () => {
        render(<TechStrip jetpack={JET} />);
        const m = screen.getByRole('meter', { name: 'Yakıt' });
        expect(m).toHaveAttribute('aria-valuenow', '61');
        expect(m.getAttribute('aria-valuetext')).toMatch(/yüzde 61, 3 enerji hücresi/);
        const pill = screen.getByTestId('hud-jetpack');
        expect(pill).toHaveTextContent('61%');
        expect(pill).toHaveTextContent('Hücre ×3');
        expect(pill).toHaveAttribute('data-level', 'ok');
    });

    it('yakıt bitince uyarı etiketi ve kritik seviye; itişte data-thrust', () => {
        render(<TechStrip jetpack={{ ...JET, fuel: 0, fraction: 0, empty: true, cells: 0, thrusting: true }} />);
        const pill = screen.getByTestId('hud-jetpack');
        expect(pill).toHaveAttribute('data-level', 'crit');
        expect(pill).toHaveAttribute('data-thrust', '1');
        expect(pill).toHaveTextContent('Boş');
        expect(screen.getByRole('meter', { name: 'Yakıt' }).getAttribute('aria-valuetext')).toMatch(/enerji hücresi yok/);
    });

    it('elde şarjlı eşya (jetpack ve portal tabancası hariç) ve kalkan çubukları', () => {
        const { rerender } = render(<TechStrip charge={{ item: 'item:kazma_elektrikli', name: 'Elektrikli Kazma', value: 100, max: 800, fraction: 0.125 }} shield={{ pieces: 2, charge: 250, max: 500, fraction: 0.5 }} />);
        expect(screen.getByTestId('hud-charge')).toHaveTextContent('Elektrikli Kazma');
        expect(screen.getByTestId('hud-charge')).toHaveAttribute('data-level', 'low');
        expect(screen.getByRole('meter', { name: 'Kalkan' }).getAttribute('aria-valuetext')).toMatch(/yüzde 50, 2 parça/);
        rerender(<TechStrip charge={{ item: 'item:jetpack', name: 'Jetpack', value: 100, max: 1000, fraction: 0.1 }} jetpack={JET} />);
        expect(screen.queryByTestId('hud-charge')).toBeNull(); // jetpack zaten kendi çubuğunda
    });

    it('portal göstergesi: mavi/turuncu açık-kapalı (metin), mühimmat ve hücre; şarj yoksa uyarı', () => {
        const { rerender } = render(<TechStrip portals={{
            held: true, mavi: true, turuncu: false, charge: 9, max: 24, cells: 2, canFire: true, next: 'turuncu',
        }}
        />);
        const p = screen.getByTestId('hud-portals');
        expect(within(p).getByRole('img')).toHaveAccessibleName('Mavi portal açık, turuncu portal kapalı');
        expect(screen.getByTestId('hud-portal-ammo')).toHaveTextContent('9/24');
        expect(screen.getByTestId('hud-portal-ammo')).toHaveTextContent('Hücre ×2');
        rerender(<TechStrip portals={{
            held: true, mavi: true, turuncu: true, charge: 0, max: 24, cells: 0, canFire: false, next: 'mavi',
        }}
        />);
        expect(screen.getByTestId('hud-portals')).toHaveTextContent('Hücre gerekli');
        expect(screen.getByTestId('hud-portals')).toHaveAttribute('data-level', 'crit');
        // tabanca elde değil ama portallar açık: yalnız göstergeler
        rerender(<TechStrip portals={{
            held: false, mavi: true, turuncu: true, charge: 0, max: 24, cells: 0, canFire: false, next: 'mavi',
        }}
        />);
        expect(screen.queryByTestId('hud-portal-ammo')).toBeNull();
    });
});

describe('EnergyChip', () => {
  it('depo/kapasite ve net hız; seviye durumu', () => {
    const { rerender } = render(<EnergyChip energy={{
        value: 420, max: 5000, gen: 12, use: 8, net: 4, live: true, nodes: 9, name: 'jenerator',
    }}
    />);
    const chip = screen.getByTestId('hud-energy');
    expect(chip).toHaveTextContent('420/5000 EU');
    expect(chip).toHaveTextContent('+4 EU/sn');
    expect(chip).toHaveAttribute('data-level', 'ok');
    rerender(<EnergyChip energy={{
        value: 0, max: 0, gen: 0, use: 0, net: 0, live: false, nodes: 3, name: 'lamba',
    }}
    />);
    expect(screen.getByTestId('hud-energy')).toHaveAttribute('data-level', 'dead');
    expect(screen.getByTestId('hud-energy')).toHaveTextContent('pil yok');
    rerender(<EnergyChip energy={null} />);
    expect(screen.queryByTestId('hud-energy')).toBeNull();
  });
});

describe('ScannerRadar', () => {
  const pings = [
    {
      type: 'maden', kind: 'elmas', name: 'Elmas Cevheri', color: 0x4fe3d6, dist: 12.4, yaw: 0.5, dy: -9, hostile: false,
    },
    {
      type: 'canlı', kind: 'golge', name: 'Gölge', color: 0xff4a4a, dist: 20, yaw: -1, dy: 0, hostile: true,
    },
  ];

  it('en yakın hedefler ok + ad + mesafe; ok dönüşü oyuncu yönüne göre', () => {
    render(<ScannerRadar scanner={{
        charge: 300, max: 400, empty: false, nextIn: 2.5, heading: 0, pings,
    }}
    />);
    const rows = screen.getAllByTestId('hud-ping');
    expect(rows.length).toBe(2);
    expect(rows[0]).toHaveTextContent('Elmas Cevheri');
    expect(rows[0]).toHaveTextContent('12 m');
    expect(rows[0]).toHaveAccessibleName('Elmas Cevheri · 12 m · aşağıda');
    const arrow = rows[0].querySelector('.kx-ping-arrow');
    expect(parseFloat(arrow.style.transform.replace(/[^\d.-]/g, ''))).toBeLessThan(0); // hedef solda → ok sola
    expect(rows[1]).toHaveAttribute('data-hostile', '1');
    expect(screen.getByTestId('hud-scanner')).toHaveTextContent('75%');
  });

  it('hedef yoksa tarama zamanlayıcısı; şarj bitince uyarı; tarayıcı yoksa çizilmez', () => {
    const { rerender, container } = render(<ScannerRadar scanner={{
        charge: 300, max: 400, empty: false, nextIn: 2.5, heading: 0, pings: [],
    }}
    />);
    expect(screen.getByTestId('hud-scanner')).toHaveTextContent('Tarama 3 sn');
    rerender(<ScannerRadar scanner={{
        charge: 2, max: 400, empty: true, nextIn: 0, heading: 0, pings: [],
    }}
    />);
    expect(screen.getByTestId('hud-scanner')).toHaveTextContent('Şarj bitti');
    expect(screen.getByTestId('hud-scanner')).toHaveAttribute('data-empty', '1');
    rerender(<ScannerRadar scanner={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('çubuk, tooltip ve KesifHud entegrasyonu', () => {
  it('Hotbar yuvasında şarj çubuğu ve etiketi', () => {
    const slots = Array.from({ length: 9 }, () => ({ item: null, count: 0 }));
    slots[0] = { item: 'item:jetpack', count: 1, charge: 0.4 };
    render(<Hotbar slots={slots} selected={0} onSelect={() => {}} iconFor={() => ''} />);
    const first = document.querySelector('[data-index="0"]');
    expect(first.getAttribute('aria-label')).toMatch(/şarj yüzde 40/);
    expect(first.querySelector('.kx-slot-chg')).toBeTruthy();
    expect(document.querySelector('[data-index="1"] .kx-slot-chg')).toBeNull();
  });

  it('PanelItemInfo: şarj çubuğu + teknoloji satırları; PanelSlot şarj çubuğu', () => {
    const slot = { item: 'item:jetpack', count: 1, charge: 250 };
    render(<PanelItemInfo slot={slot} />);
    expect(screen.getByTestId('item-charge')).toHaveTextContent('Şarj 250/1000 (25%)');
    expect(screen.getByTestId('item-tech')).toHaveTextContent(/Çubukta taşırken zıplamayı basılı tut/);
    expect(screen.getByTestId('item-tech').textContent).not.toMatch(/250 \/ 1000/);
    render(<PanelSlot addr="s0" slot={slot} />);
    expect(document.querySelector('.kp-chg')).toBeTruthy();
    expect(screen.getByTestId('slot-s0').getAttribute('aria-label')).toMatch(/şarj yüzde 25/);
  });

  it('KesifHud: hud.jetpack/portals/scanner/energy alanları parçaları çizer; macera dışında boş', () => {
    const store = createHudStore();
    store.set({
        mode: 'macera',
        jetpack: JET,
        portals: {
            held: true, mavi: true, turuncu: false, charge: 20, max: 24, cells: 0, canFire: true, next: 'turuncu',
        },
        scanner: {
            charge: 300, max: 400, empty: false, nextIn: 3, heading: 0, pings: [],
        },
        energy: {
            value: 10, max: 5000, gen: 4, use: 1, net: 3, live: true, nodes: 4, name: 'gunes',
        },
    });
    render(<KesifHud store={store} actions={{}} touch={false} settings={{}} />);
    expect(screen.getByTestId('hud-jetpack')).toBeInTheDocument();
    expect(screen.getByTestId('hud-portals')).toBeInTheDocument();
    expect(screen.getByTestId('hud-scanner')).toBeInTheDocument();
    expect(screen.getByTestId('hud-energy')).toBeInTheDocument();
  });
});
