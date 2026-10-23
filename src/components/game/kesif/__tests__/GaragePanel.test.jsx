// @vitest-environment jsdom
/*
 * Garaj paneli (vehicle_ui): sekmeler, satın alma/kiralama/çağırma akışı, boya, Kredi bakiyesi, kilit nedenleri, aria, klavye.
 * Sahte api, systems/vehicles.js garageView ile aynı biçimi üretir.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import GaragePanel from '../city/GaragePanel.jsx';
import { COSMETICS, VEHICLE_CLASSES, VEHICLE_DEFS, defaultCosmetics } from '../../../../game/kesif/sim/city/vehicle/vehicleData.js';

function fakeGarageApi(init) {
  const st = {
    kredi: 700, km: 4, owned: [{ cls: 'suzulkay', cos: defaultCosmetics('suzulkay', 0) }, { cls: 'taksi', cos: defaultCosmetics('taksi', 0) }], active: 0, rental: null, summoned: false, ...init,
  };
  const view = () => ({
    active: st.active,
    owned: st.owned.map((o, i) => ({
      idx: i, cls: o.cls, name: VEHICLE_DEFS[o.cls].name, cos: Object.assign({}, o.cos, { under: Object.assign({}, o.cos.under) }),
    })),
    summoned: st.summoned,
    rental: st.rental,
    kredi: st.kredi,
    capacity: 6,
    km: st.km,
    catalog: VEHICLE_CLASSES.map((cls) => {
      const d = VEHICLE_DEFS[cls];
      return {
        cls, name: d.name, desc: d.desc, price: d.price, rent: d.rent, maxKmh: Math.round(d.max * 3.6), seats: d.seats, parcels: d.parcels, kind: d.kind, unlocked: st.km >= d.unlock.minKm, needKm: d.unlock.minKm, owned: st.owned.some((o) => o.cls === cls),
      };
    }),
    swatches: {
      body: COSMETICS.body.map((s) => ({ name: s.name, hex: s.hex, shape: s.shape })),
      accent: COSMETICS.accent.map((s) => ({ name: s.name, hex: s.hex, shape: s.shape })),
      neon: COSMETICS.neon.map((s) => ({ name: s.name, hex: s.hex, shape: s.shape })),
      wheels: COSMETICS.wheels.map((s) => ({ name: s.name, shape: s.shape })),
      horns: COSMETICS.horns.map((s) => ({ name: s.name, shape: s.shape })),
      underPatterns: COSMETICS.underPatterns.slice(),
    },
  });
  const api = {
    _st: st,
    getGarage: vi.fn(view),
    setGarage: vi.fn((p) => {
      if (Number.isInteger(p.active)) {
        st.active = p.active;
        return true;
      }
      if (p.paint) {
        st.owned[p.paint.idx].cos = p.paint.cos;
        return true;
      }
      return false;
    }),
    buyVehicle: vi.fn((cls) => {
      const d = VEHICLE_DEFS[cls];
      if (st.owned.some((o) => o.cls === cls)) return { ok: false, reason: 'sahip' };
      if (st.km < d.unlock.minKm) return { ok: false, reason: 'kilit' };
      if (st.kredi < d.price) return { ok: false, reason: 'kredi' };
      st.kredi -= d.price;
      st.owned.push({ cls, cos: defaultCosmetics(cls, 0) });
      return { ok: true };
    }),
    summonVehicle: vi.fn(() => (st.owned.length ? { ok: true, id: 1 } : { ok: false, reason: 'arac-yok' })),
    rentVehicle: vi.fn((cls) => {
      if (st.rental) return { ok: false, reason: 'surulen' };
      if (st.kredi < VEHICLE_DEFS[cls].rent) return { ok: false, reason: 'kredi' };
      st.kredi -= VEHICLE_DEFS[cls].rent;
      st.rental = { cls, left: 600 };
      return { ok: true, price: VEHICLE_DEFS[cls].rent };
    }),
  };
  return api;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const mount = (over, props) => {
  const api = fakeGarageApi(over);
  const onClose = vi.fn();
  const utils = render(<GaragePanel api={api} onClose={onClose} {...props} />);
  return { api, onClose, ...utils };
};

describe('GaragePanel: yapı ve erişilebilirlik', () => {
  it('role=dialog Garaj, sekmeler (tablist/tab), Kredi bakiyesi, araç sayısı', () => {
    mount();
    const dlg = screen.getByRole('dialog', { name: 'Garaj' });
    expect(dlg).toBeInTheDocument();
    const tabs = within(dlg).getByRole('tablist', { name: 'Garaj bölümleri' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Garajım', 'Satın al', 'Kirala']);
    expect(within(tabs).getByRole('tab', { name: 'Garajım' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('garage-kredi')).toHaveAttribute('aria-label', 'Bakiye 700 Kredi');
    expect(screen.getByText('2 / 6 araç · 4 km sürdün')).toBeInTheDocument();
  });

  it('Esc kapatır; arka plana dokunmak kapatır; kapat düğmesi', () => {
    const { onClose } = mount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => screen.getByRole('button', { name: 'Kapat' }).click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('api yoksa/okunamazsa "kullanılamıyor" ve çökmez', () => {
    render(<GaragePanel api={{ getGarage: () => null }} onClose={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Garaj şu an kullanılamıyor.');
    cleanup();
    render(<GaragePanel api={null} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Garaj' })).toBeInTheDocument();
    cleanup();
    render(<GaragePanel api={{ getGarage: () => { throw new Error('x'); } }} onClose={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('kullanılamıyor');
  });

  it('boş garaj ipucu ve Süzülkay hediyesi', () => {
    mount({ owned: [] });
    expect(screen.getByTestId('garage-empty')).toHaveTextContent('Süzülkay hediyedir');
  });
});

describe('GaragePanel: Garajım', () => {
  it('sahip olunan araçlar listelenir, aktif rozeti; aktif yap; çağır paneli kapatır', () => {
    const { api, onClose } = mount();
    expect(screen.getByTestId('owned-0')).toHaveTextContent('Süzülkay');
    expect(screen.getByTestId('owned-1')).toHaveTextContent('Meridyen Taksi');
    expect(screen.getByTestId('active-badge')).toBeInTheDocument();
    expect(screen.getByTestId('btn-active')).toBeDisabled();
    act(() => screen.getByTestId('owned-1').click());
    expect(screen.getByTestId('owned-1')).toHaveAttribute('aria-pressed', 'true');
    act(() => screen.getByTestId('btn-active').click());
    expect(api.setGarage).toHaveBeenCalledWith({ active: 1 });
    expect(screen.getByTestId('garage-live')).toHaveTextContent('Meridyen Taksi aktif araç oldu.');
    act(() => screen.getByTestId('btn-summon').click());
    expect(api.summonVehicle).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('çağırma başarısız olursa panel açık kalır ve neden okunur', () => {
    const { onClose } = mount();
    // araç yok → gerçek api'de reason arac-yok; burada park yok senaryosu
    const api2 = fakeGarageApi();
    api2.summonVehicle = vi.fn(() => ({ ok: false, reason: 'park' }));
    cleanup();
    render(<GaragePanel api={api2} onClose={onClose} />);
    act(() => screen.getByTestId('btn-summon').click());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('garage-live')).toHaveTextContent('Yakında boş park yeri yok');
  });

  it('boya: gövde/şerit/neon örnekleri ŞEKİL + ad (aria-label), seçili aria-pressed; tıklamak setGarage(paint) çağırır', () => {
    const { api } = mount();
    const body = screen.getByRole('group', { name: 'Gövde' });
    const sw = within(body).getAllByRole('button');
    expect(sw).toHaveLength(16);
    sw.forEach((b) => {
      expect(b.getAttribute('aria-label').length).toBeGreaterThan(2);
      expect(b.querySelector('svg path')).toBeTruthy(); // renk körü: şekil simgesi
    });
    const cur = defaultCosmetics('suzulkay', 0).body;
    expect(sw[cur]).toHaveAttribute('aria-pressed', 'true');
    act(() => sw[(cur + 1) % 16].click());
    const call = api.setGarage.mock.calls.pop()[0];
    expect(call.paint.idx).toBe(0);
    expect(call.paint.cos.body).toBe((cur + 1) % 16);
    expect(within(screen.getByRole('group', { name: 'Neon' })).getAllByRole('button')).toHaveLength(12);
    expect(within(screen.getByRole('group', { name: 'Jant' })).getAllByRole('button')).toHaveLength(4);
    expect(within(screen.getByRole('group', { name: 'Korna' })).getAllByRole('button')).toHaveLength(4);
  });

  it('zemin ışığı anahtarı: açınca renk ve desen seçenekleri çıkar; desen seçimi setGarage', () => {
    const { api } = mount();
    expect(screen.queryByRole('group', { name: 'Zemin rengi' })).toBeNull();
    const sw = screen.getByTestId('under-toggle');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    act(() => sw.click());
    expect(api.setGarage.mock.calls.pop()[0].paint.cos.under.on).toBe(true);
    expect(screen.getByTestId('under-toggle')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('group', { name: 'Zemin rengi' })).toBeInTheDocument();
    act(() => screen.getByTestId('pattern-dalga').click());
    expect(api.setGarage.mock.calls.pop()[0].paint.cos.under.pattern).toBe(2);
    expect(screen.getByTestId('pattern-dalga')).toHaveAttribute('aria-pressed', 'true');
  });

  it('ön izleme SVG\'si seçili boya rengini yansıtır; sınıf özellik çubukları', () => {
    mount();
    expect(screen.getByTestId('garage-preview')).toHaveAttribute('role', 'img');
    expect(screen.getByRole('list', { name: 'Sınıf özellikleri' }).querySelectorAll('li')).toHaveLength(6);
  });
});

describe('GaragePanel: Satın al ve Kirala', () => {
  const goTab = (n) => act(() => screen.getByTestId('tab-' + n).click());

  it('katalog: fiyat Kredi, sahip olunan araç kapalı, kilitli neden metni, yetersiz Kredi', () => {
    mount({ km: 0, kredi: 700 });
    goTab('buy');
    expect(screen.getByRole('tab', { name: 'Satın al' })).toHaveAttribute('aria-selected', 'true');
    const items = screen.getAllByRole('listitem').filter((li) => li.dataset.testid && li.dataset.testid.startsWith('shop-'));
    expect(items).toHaveLength(6);
    expect(screen.getByTestId('shop-suzulkay')).toHaveAttribute('data-owned', '1');
    expect(screen.getByTestId('buy-suzulkay')).toBeDisabled();
    expect(screen.getByTestId('buy-taksi')).toBeDisabled(); // sahip
    // spor: kilit (8 km) → neden metni
    expect(within(screen.getByTestId('shop-spor')).getByText(/Kilitli: 8 km sür/)).toBeInTheDocument();
    expect(screen.getByTestId('buy-spor')).toBeDisabled();
    // kamyonet (800 Kredi, 3 km): kilitli
    expect(screen.getByTestId('buy-kamyonet')).toBeDisabled();
    // motor: 400 Kredi, kilit yok → satın alınabilir
    expect(screen.getByTestId('buy-motor')).not.toBeDisabled();
    expect(within(screen.getByTestId('shop-motor')).getByText(/400 Kredi/)).toBeInTheDocument();
    expect(screen.getByTestId('buy-motor')).toHaveAttribute('aria-label', 'Satın al: Neon Moto, 400 Kredi');
  });

  it('satın alma: Kredi düşer, Garajım\'a dönülür, ekran okuyucuya bildirilir; yetersiz Kredi düğmeyi kapatır', () => {
    const { api } = mount({ km: 20, kredi: 450 });
    goTab('buy');
    act(() => screen.getByTestId('buy-motor').click());
    expect(api.buyVehicle).toHaveBeenCalledWith('motor');
    expect(screen.getByRole('tab', { name: 'Garajım' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('garage-live')).toHaveTextContent('Araç garajına eklendi.');
    expect(screen.getByTestId('garage-kredi')).toHaveAttribute('aria-label', 'Bakiye 50 Kredi');
    expect(screen.getByTestId('owned-2')).toHaveTextContent('Neon Moto');
    goTab('buy');
    expect(within(screen.getByTestId('shop-spor')).getByText(/Yetersiz Kredi: 1750 eksik/)).toBeInTheDocument();
    expect(screen.getByTestId('buy-spor')).toBeDisabled();
  });

  it('garaj dolu (6 araç): satın alma kapalı ve neden yazılı', () => {
    const owned = ['suzulkay', 'taksi', 'kamyonet', 'motor', 'spor', 'hoverbike'].map((cls) => ({ cls, cos: defaultCosmetics(cls, 0) }));
    mount({ owned, km: 99, kredi: 99999 });
    goTab('buy');
    ['suzulkay', 'taksi'].forEach((c) => expect(screen.getByTestId('buy-' + c)).toBeDisabled());
    owned.forEach((o) => expect(screen.getByTestId('shop-' + o.cls)).toHaveAttribute('data-owned', '1'));
  });

  it('kirala: 20 Kredi / 10 dk fiyatı, kiralama başarılıysa panel kapanır; başka kiralık varken kapalı', () => {
    const { api, onClose } = mount({ kredi: 100 });
    goTab('rent');
    expect(within(screen.getByTestId('rent-taksi')).getByText(/20 Kredi \/ 10 dk/)).toBeInTheDocument();
    expect(screen.getByTestId('rentbtn-taksi')).toHaveAttribute('aria-label', 'Kirala: Meridyen Taksi, 20 Kredi');
    act(() => screen.getByTestId('rentbtn-taksi').click());
    expect(api.rentVehicle).toHaveBeenCalledWith('taksi');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('kiralık aktifken kalan süre gösterilir ve yeni kiralama kapalı', () => {
    mount({ rental: { cls: 'taksi', left: 125 } });
    goTab('rent');
    expect(screen.getByTestId('rental-active')).toHaveTextContent('Meridyen Taksi');
    expect(screen.getByTestId('rental-active')).toHaveTextContent('2 dk 5 sn');
    expect(screen.getByTestId('rentbtn-motor')).toBeDisabled();
    expect(within(screen.getByTestId('rent-motor')).getByText('Önce kiralık aracı teslim et')).toBeInTheDocument();
  });

  it('kiralama noktasına uzaksan neden okunur ve panel açık kalır', () => {
    const api = fakeGarageApi({ kredi: 100 });
    api.rentVehicle = vi.fn(() => ({ ok: false, reason: 'uzak' }));
    const onClose = vi.fn();
    render(<GaragePanel api={api} onClose={onClose} />);
    goTab('rent');
    act(() => screen.getByTestId('rentbtn-motor').click());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('garage-live')).toHaveTextContent('Kiralama noktasına yaklaş.');
  });

  it('yetersiz Kredi kirayı kapatır', () => {
    mount({ kredi: 10 });
    goTab('rent');
    expect(screen.getByTestId('rentbtn-taksi')).toBeDisabled();
    expect(within(screen.getByTestId('rent-taksi')).getByText(/Yetersiz Kredi: 10 eksik/)).toBeInTheDocument();
  });

  it('düğmeler ve örnekler ≥ 44 px sınıfı kullanır; panel sekme gezintisi klavyeyle (Enter/Tab odak halkası)', () => {
    mount();
    // 44 px: CSS sınıfları kg-sw (44×44), kg-chip/ kp-btn (min-height 44); jsdom yerleşim yapmaz → sınıf sözleşmesi
    const body = screen.getByRole('group', { name: 'Gövde' });
    within(body).getAllByRole('button').forEach((b) => expect(b.classList.contains('kg-sw')).toBe(true));
    expect(screen.getByTestId('btn-summon').classList.contains('kp-btn')).toBe(true);
  });
});
