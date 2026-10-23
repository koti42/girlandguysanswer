// @vitest-environment jsdom
/*
 * NPC arayüzü (npc_vendors): DialogueSheet + VendorPanel — GERÇEK diyalog verisi / satıcı mantığı üstünde sahte motor cephesi.
 * Klavye 1–4, Esc, dokunma (tıklama), aria (role=dialog, aria-live tam metin, aria-disabled), 44 px CSS kuralları, daktilo (hareket azaltma), sayfalama, odak, tüm NPC portreleri.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import {
  afterEach, beforeAll, describe, expect, it, vi,
} from 'vitest';
import {
  act, cleanup, fireEvent, render, screen,
} from '@testing-library/react';
import DialogueSheet, { DialogueView, NpcPortrait } from '../city/DialogueSheet.jsx';
import VendorPanel from '../city/VendorPanel.jsx';
import { makeTalkKit } from '../../../../game/kesif/sim/city/ped/npcTestKit.js';
import { NPCS, npcLook } from '../../../../game/kesif/sim/city/ped/npcData.js';
import { buyFrom, sellTo, vendorView } from '../../../../game/kesif/sim/city/ped/vendorLogic.js';
import { getNpc } from '../../../../game/kesif/sim/city/ped/npcData.js';
import { createWallet, rollDay, shopOf } from '../../../../game/kesif/sim/city/ped/npcSave.js';
import { Inventory } from '../../../../game/kesif/sim/inventory.js';

const CSS = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../city/npcPanels.css'), 'utf8');

beforeAll(() => {
  // jsdom'da tuval yok: eşya simgeleri yedek rozetle çizilir (gürültüsüz)
  HTMLCanvasElement.prototype.getContext = () => null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function dialogueApi(opts) {
  const kit = makeTalkKit(opts);
  return {
    kit,
    getDialogue: vi.fn(() => kit.talk.view()),
    chooseDialogue: vi.fn((n) => kit.talk.choose(n)),
    closeDialogue: vi.fn(() => kit.talk.close('kapat')),
  };
}

const flush = () => act(async () => { await Promise.resolve(); });

describe('DialogueSheet', () => {
  it('rol/aria: dialog, ad+unvan, tam metin aria-live, seçenekler numaralı, ilk etkin seçeneğe odak', () => {
    const api = dialogueApi();
    api.kit.talk.start('rehber_zeynep');
    render(<DialogueSheet api={api} onClose={() => {}} reducedMotion />);
    const dlg = screen.getByRole('dialog', { name: 'Zeynep' });
    expect(dlg.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Meridyen Rehberi')).toBeTruthy();
    const live = screen.getByTestId('dialogue-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Zeynep: Neon Meridyen\'e hoş geldin! Ben Zeynep, rehberin.');
    const btns = [1, 2, 3, 4].map((n) => screen.getByTestId('choice-' + n));
    btns.forEach((b, i) => {
      expect(b.querySelector('kbd').textContent).toBe(String(i + 1));
      expect(b.getAttribute('aria-keyshortcuts')).toBe(String(i + 1));
      expect(b.getAttribute('aria-disabled')).toBe('false');
    });
    expect(document.activeElement).toBe(btns[0]);
    expect(screen.getByTestId('dialogue-close').getAttribute('aria-label')).toBe('Konuşmayı kapat');
  });

  it('klavye 1–4 seçer; Numpad da; Esc kapatır; geçersiz tuş yok sayılır', async () => {
    const api = dialogueApi();
    api.kit.talk.start('kerem');
    const onClose = vi.fn();
    render(<DialogueSheet api={api} onClose={onClose} reducedMotion pollMs={20} />);
    fireEvent.keyDown(document, { code: 'Digit1', key: '1' });
    expect(api.chooseDialogue).toHaveBeenCalledWith(1);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.getByRole('dialog', { name: 'Kerem' })).toBeTruthy();
    expect(screen.getByTestId('dialogue-live').textContent).toContain('Manzaraya bak');
    fireEvent.keyDown(document, { code: 'Numpad2', key: '2' });
    expect(api.chooseDialogue).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(document, { code: 'Digit9', key: '9' });
    fireEvent.keyDown(document, { code: 'KeyA', key: 'a' });
    expect(api.chooseDialogue).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(api.closeDialogue).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('dokunma/tıklama seçer; çıkış seçeneği diyaloğu bitirir ve sheet kaybolur', async () => {
    const api = dialogueApi();
    api.kit.talk.start('kerem');
    render(<DialogueSheet api={api} onClose={() => {}} reducedMotion pollMs={20} />);
    fireEvent.click(screen.getByTestId('choice-4')); // Hoşça kal
    expect(api.chooseDialogue).toHaveBeenCalledWith(4);
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.queryByRole('dialog')).toBe(null);
  });

  it('pasif seçenek: aria-disabled, neden metni; tıklayınca not gösterir ve motoru ÇAĞIRMAZ', async () => {
    const api = dialogueApi({ kredi: 3 });
    api.kit.talk.start('dr_bolt');
    api.kit.talk.choose(1);
    api.kit.talk.choose(3); // work
    render(<DialogueSheet api={api} onClose={() => {}} reducedMotion pollMs={20} />);
    const off = screen.getByText('Tam bakım (10 Kredi)').closest('button');
    expect(off.getAttribute('aria-disabled')).toBe('true');
    expect(off.textContent).toContain('Yetersiz Kredi');
    fireEvent.click(off);
    expect(api.chooseDialogue).not.toHaveBeenCalled();
    expect(screen.getByTestId('dialogue-msg').textContent).toContain('Yetersiz Kredi');
    fireEvent.keyDown(document, { code: 'Digit1', key: '1' }); // etkin ilk seçenek: hediye değil → seçenek 1 pasif olabilir; motor çağrılmaz ya da etkinse çağrılır
  });

  it('daktilo: hareket azaltma/erişilebilirlikte metin anında; normalde kademeli, tıklayınca/Boşluk ile atlanır; aria-hidden', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const api = dialogueApi();
    api.kit.talk.start('tuna');
    const { rerender } = render(<DialogueSheet api={api} onClose={() => {}} reducedMotion />);
    expect(screen.getByTestId('dialogue-text').textContent).toContain('Kapıyı çaldın mı? Neyse, gir, gir.');
    cleanup();
    render(<DialogueSheet api={api} onClose={() => {}} accessibility />);
    expect(screen.getByTestId('dialogue-text').textContent).toContain('gir, gir.');
    cleanup();
    render(<DialogueSheet api={api} onClose={() => {}} />);
    const line = screen.getByTestId('dialogue-text').querySelector('.knp-line');
    expect(line.getAttribute('aria-hidden')).toBe('true');
    const before = line.textContent;
    expect(before.length).toBeLessThan('Kapıyı çaldın mı? Neyse, gir, gir.'.length);
    act(() => { vi.advanceTimersByTime(300); });
    expect(line.textContent.length).toBeGreaterThan(before.length);
    fireEvent.keyDown(document, { key: ' ' });
    expect(line.textContent).toBe('Kapıyı çaldın mı? Neyse, gir, gir.');
    expect(rerender).toBeTruthy();
    // tam metin ekran okuyucu için her zaman hazır
    expect(screen.getByTestId('dialogue-live').textContent).toContain('Kapıyı çaldın mı?');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(line.textContent).toBe('Kapıyı çaldın mı? Neyse, gir, gir.');
  });

  it('uzun metin sayfalanır: son sayfaya dek seçenekler pasif ve tıklama "Devam"; sonra seçenek etkin', () => {
    const view = {
      type: 'dialogue',
      npc: { id: 'kerem', name: 'Kerem', title: 'Loft sahibi', kind: 'owner', species: 'insan' },
      node: 'kerem.x',
      lines: ['Bu çok uzun bir konuşma parçasıdır ve sayfalara bölünmelidir.', 'İkinci cümle burada başlıyor, üçüncü cümle de arkasından geliyor ve sürüyor.'],
      choices: [{ n: 1, t: 'Devam', enabled: true }, { n: 2, t: 'Çık', enabled: true }],
      msg: '',
      mood: 'selam',
      version: 1,
    };
    const onChoose = vi.fn();
    render(<DialogueView view={view} onChoose={onChoose} onClose={() => {}} accessibility reducedMotion />);
    const choice = screen.getByTestId('choice-1');
    expect(choice.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(document, { code: 'Digit1', key: '1' });
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('dialogue-text'));
    fireEvent.click(screen.getByTestId('dialogue-text'));
    fireEvent.click(screen.getByTestId('dialogue-text'));
    expect(screen.getByTestId('choice-1').getAttribute('aria-disabled')).toBe('false');
    fireEvent.keyDown(document, { code: 'Digit1', key: '1' });
    expect(onChoose).toHaveBeenCalledWith(1);
  });

  it('odak tuzağı: son düğmede Tab ilk düğmeye döner; Shift+Tab sondan', () => {
    const api = dialogueApi();
    api.kit.talk.start('kerem');
    render(<DialogueSheet api={api} onClose={() => {}} reducedMotion />);
    const sheet = screen.getByTestId('dialogue-sheet');
    const items = Array.from(sheet.querySelectorAll('button'));
    const first = items[0];
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('motor yoksa ya da görünüm null ise hiçbir şey çizmez; api.getDialogue yoklanır ve değişimi yansıtır', async () => {
    const { container } = render(<DialogueSheet api={{ getDialogue: () => null }} onClose={() => {}} pollMs={20} />);
    expect(container.firstChild).toBe(null);
    cleanup();
    const c2 = render(<DialogueSheet api={null} onClose={() => {}} />);
    expect(c2.container.firstChild).toBe(null);
    cleanup();
    const api = dialogueApi();
    render(<DialogueSheet api={api} onClose={() => {}} reducedMotion pollMs={15} />);
    expect(screen.queryByRole('dialog')).toBe(null);
    api.kit.talk.start('tuna');
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(screen.getByRole('dialog', { name: 'Tuna' })).toBeTruthy();
  });

  it('46 NPC portresi hatasız çizilir (SVG, aria-hidden, renkler)', () => {
    NPCS.forEach((n) => {
      const { container, unmount } = render(<NpcPortrait look={npcLook(n)} kind={n.kind} mood="selam" />);
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.querySelectorAll('ellipse,rect,path,circle').length).toBeGreaterThan(5);
      unmount();
    });
  });

  it('tüm diyalog düğümleri çizilebilir (46 NPC kökü) ve seçenek sayısı ≤ 4', () => {
    const api = dialogueApi();
    NPCS.forEach((n) => {
      const v = api.kit.talk.start(n.id);
      const { unmount } = render(<DialogueView view={v} onChoose={() => {}} onClose={() => {}} reducedMotion />);
      expect(screen.getAllByRole('button').filter((b) => b.className.indexOf('knp-choice') >= 0).length).toBe(v.choices.length);
      expect(v.choices.length).toBeLessThanOrEqual(4);
      unmount();
      api.kit.talk.close('x');
    });
  });
});

describe('npcPanels.css: erişilebilirlik kuralları', () => {
  it('seçenek ≥ 48 px, kapat/stepper ≥ 44 px, odak halkası, hareket azaltma animasyonu kapalı, yanıp sönme yok', () => {
    expect(CSS).toMatch(/\.knp-choice \{[^}]*min-height: 48px/);
    expect(CSS).toMatch(/\.knp-close \{[^}]*width: 44px;[^}]*height: 44px/);
    expect(CSS).toMatch(/\.knp-step-btn \{[^}]*width: 44px;[^}]*height: 44px/);
    expect(CSS).toMatch(/\.knp-buy \{[^}]*min-height: 44px/);
    expect(CSS).toMatch(/focus-visible/);
    expect(CSS).toMatch(/\.knp-dlg\.knp-calm \{ animation: none; \}/);
    expect(CSS).toMatch(/\.knp-calm \.knp-caret \{ animation: none; \}/);
    expect(CSS).toMatch(/knp-caret 1s steps\(2/); // 1 Hz: > 3 Hz yanıp sönme yok
    expect(CSS).not.toMatch(/animation:[^;]*0\.[0-2]\d?s[^;]*infinite/);
  });
});

/* ---------------------------------------------------------------------------------------------- satıcı paneli */
function vendorApi(o) {
  const opts = o || {};
  const city = { kredi: opts.kredi === undefined ? 300 : opts.kredi };
  const inv = new Inventory();
  (opts.items || []).forEach((p) => inv.add(p[0], p[1]));
  const wallet = createWallet(() => city, null);
  const state = { id: opts.vendor || 'usta_selvi', msg: '', open: true };
  const ctx = () => {
    rollDay(city, 0);
    return {
      seed: 123456, dayN: 0, shop: shopOf(city), inv, wallet, isBound: () => false,
    };
  };
  const info = (id) => {
    const n = getNpc(id);
    return n ? { name: n.name, title: n.title, brand: '' } : { name: 'Otomat', title: 'Atıştırmalık Otomatı', brand: '' };
  };
  return {
    city,
    inv,
    state,
    getVendor: vi.fn(() => {
      if (!state.open) return null;
      const v = vendorView(ctx(), state.id, info(state.id));
      v.msg = state.msg;
      return v;
    }),
    vendorBuy: vi.fn((item, n) => { const r = buyFrom(ctx(), state.id, item, n); state.msg = r.message; return r; }),
    vendorSell: vi.fn((item, n) => { const r = sellTo(ctx(), state.id, item, n); state.msg = r.message; return r; }),
    closeVendor: vi.fn(() => { state.open = false; return true; }),
  };
}

describe('VendorPanel', () => {
  it('dialog, ad+unvan, Kredi çipi, rozet "Ana diyara taşınır", günün 6 teklifi', () => {
    const api = vendorApi();
    render(<VendorPanel api={api} onClose={() => {}} reducedMotion />);
    const dlg = screen.getByRole('dialog', { name: 'Usta Selvi' });
    expect(dlg).toBeTruthy();
    expect(screen.getByText(/Ramen ustası/)).toBeTruthy();
    expect(screen.getByTestId('vendor-kredi').getAttribute('aria-label')).toBe('Bakiye 300 Kredi');
    expect(screen.getByTestId('vendor-carry').textContent).toContain('Ana diyara taşınır');
    expect(document.querySelectorAll('[data-testid^="offer-"]').length).toBe(6);
    expect(screen.getAllByText(/Ana diyara taşınır/).length).toBeGreaterThanOrEqual(7);
  });

  it('satın alma: adet artır, satın al → Kredi/stok güncellenir, aria-live bildirir; yetersiz Kredide düğme pasif', async () => {
    const api = vendorApi({ kredi: 300 });
    render(<VendorPanel api={api} onClose={() => {}} reducedMotion />);
    const v = api.getVendor();
    const o = v.offers.find((x) => x.canBuy);
    const row = screen.getByTestId('offer-' + o.item);
    const plus = row.querySelector('[aria-label="Artır"]');
    if (o.left >= 2 && !plus.disabled) fireEvent.click(plus);
    const buy = screen.getByTestId('buy-' + o.item);
    fireEvent.click(buy);
    expect(api.vendorBuy).toHaveBeenCalled();
    const n = api.vendorBuy.mock.calls[0][1];
    expect(api.inv.count(o.item)).toBe(n);
    expect(api.city.kredi).toBe(300 - o.price * n);
    await flush();
    expect(screen.getByTestId('vendor-live').textContent).toContain('alındı');
    expect(screen.getByTestId('vendor-kredi').getAttribute('aria-label')).toBe('Bakiye ' + (300 - o.price * n) + ' Kredi');
    cleanup();
    const poor = vendorApi({ kredi: 0 });
    render(<VendorPanel api={poor} onClose={() => {}} reducedMotion />);
    document.querySelectorAll('[data-testid^="buy-"]').forEach((b) => expect(b.disabled).toBe(true));
    expect(screen.getAllByText('Yeterli Kredin yok.').length).toBeGreaterThan(0);
  });

  it('sat sekmesi: elindeki satılabilir eşya listelenir, satış Kredi verir; boşsa mesaj', async () => {
    const api = vendorApi({ kredi: 0, items: [['item:elma', 10]] });
    render(<VendorPanel api={api} onClose={() => {}} reducedMotion />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sat' }));
    const row = screen.getByTestId('sell-item:elma');
    expect(row.textContent).toContain('Elinde 10');
    fireEvent.click(screen.getByTestId('sellbtn-item:elma'));
    expect(api.vendorSell).toHaveBeenCalledWith('item:elma', 1);
    expect(api.city.kredi).toBeGreaterThan(0);
    expect(api.inv.count('item:elma')).toBe(9);
    await flush();
    expect(screen.getByTestId('vendor-live').textContent).toContain('satıldı');
    cleanup();
    const empty = vendorApi({ items: [] });
    render(<VendorPanel api={empty} onClose={() => {}} reducedMotion />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sat' }));
    expect(screen.getByTestId('vendor-sell-empty')).toBeTruthy();
  });

  it('kapat düğmesi ve Esc closeVendor çağırır; motor yoksa "Tezgâh şu an kapalı" gösterir', () => {
    const api = vendorApi();
    const onClose = vi.fn();
    render(<VendorPanel api={api} onClose={onClose} reducedMotion />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(api.closeVendor).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    const api2 = vendorApi();
    const onClose2 = vi.fn();
    render(<VendorPanel api={api2} onClose={onClose2} reducedMotion />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(api2.closeVendor).toHaveBeenCalled();
    expect(onClose2).toHaveBeenCalled();
    cleanup();
    render(<VendorPanel api={{ getVendor: () => null, closeVendor: () => true }} onClose={() => {}} reducedMotion />);
    expect(screen.getByRole('status').textContent).toContain('kapalı');
  });

  it('otomat ve tüm sahip tezgâhları çizilir (23 satıcı) ve her teklifte ad/fiyat/rozet var', () => {
    const ids = ['otomat'].concat(NPCS.filter((n) => n.shop).map((n) => n.id));
    expect(ids.length).toBe(23);
    ids.forEach((id) => {
      const api = vendorApi({ vendor: id });
      const { unmount } = render(<VendorPanel api={api} onClose={() => {}} reducedMotion />);
      expect(document.querySelectorAll('[data-testid^="offer-"]').length).toBe(6);
      document.querySelectorAll('[data-testid^="offer-"]').forEach((li) => {
        expect(li.querySelector('.knp-offer-name').textContent.length).toBeGreaterThan(0);
        expect(li.querySelector('.knp-price').textContent).toMatch(/\d/);
      });
      unmount();
    });
  });
});
