// @vitest-environment jsdom
/*
 * KesifGameScreen ↔ NPC arayüzü (npc_vendors): hud.ui 'dialogue' → DialogueSheet (kilit paneli ev sahibiyle yan yana), hud.ui 'vendor' → VendorPanel;
 * motor cephesi (kesifPanelApi FACADE_DEFAULTS) getDialogue/chooseDialogue/closeDialogue/getVendor/vendorBuy/vendorSell/closeVendor/talkTo/openVendor'ı iletir.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act, cleanup, configure, fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../engineLoader', () => ({ loadKesifEngine: vi.fn() }));

import { loadKesifEngine } from '../engineLoader';
import KesifGameScreen from '../KesifGameScreen';
import { FACADE_DEFAULTS, createPanelApi } from '../kesifPanelApi.js';
import { fakeApi } from '../../../../components/game/kesif/__tests__/kesifTestKit';
import { makeEngine } from './fakeKesifEngine';
import { makeTalkKit } from '../../../../game/kesif/sim/city/ped/npcTestKit.js';
import { buyFrom, vendorView } from '../../../../game/kesif/sim/city/ped/vendorLogic.js';
import { createWallet, shopOf } from '../../../../game/kesif/sim/city/ped/npcSave.js';
import { Inventory } from '../../../../game/kesif/sim/inventory.js';

const MACERA = { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null };
let engine;

async function ready() {
  await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
  act(() => engine.cb.onReady());
  await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
}

function mountScreen() {
  return render(
    <MemoryRouter>
      <KesifGameScreen entry={MACERA} user={null} avatar={null} api={fakeApi()} onExit={() => {}} />
    </MemoryRouter>,
  );
}

describe('kesifPanelApi: NPC cephe varsayılanları', () => {
  it('motor yokken güvenli değerler; motor varsa çağrılar iletilir', () => {
    ['getDialogue', 'chooseDialogue', 'closeDialogue', 'talkTo', 'getVendor', 'openVendor', 'vendorBuy', 'vendorSell', 'closeVendor'].forEach((k) => {
      expect(Object.prototype.hasOwnProperty.call(FACADE_DEFAULTS, k), k).toBe(true);
    });
    const none = createPanelApi(() => null);
    expect(none.getDialogue()).toBe(null);
    expect(none.getVendor()).toBe(null);
    expect(none.chooseDialogue(1)).toMatchObject({ ok: false, ended: true });
    expect(none.vendorBuy('item:elma', 1)).toMatchObject({ ok: false });
    expect(none.talkTo('kerem')).toMatchObject({ ok: false });
    const g = { getDialogue: vi.fn(() => ({ x: 1 })), vendorBuy: vi.fn((i, n) => ({ ok: true, i, n })) };
    const api = createPanelApi(() => g);
    expect(api.getDialogue()).toEqual({ x: 1 });
    expect(api.vendorBuy('item:elma', 2)).toEqual({ ok: true, i: 'item:elma', n: 2 });
  });
});

describe('KesifGameScreen: diyalog ve satıcı panelleri', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLCanvasElement.prototype.getContext = () => null;
    Element.prototype.scrollIntoView = vi.fn();
    engine = makeEngine();
    loadKesifEngine.mockResolvedValue(engine.mod);
  });
  afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 5));
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  it("ui 'dialogue': DialogueSheet motorun getDialogue görünümünü çizer; seçenek chooseDialogue(n)'e gider; ui kapanınca sayfa kalkar", async () => {
    const kit = makeTalkKit();
    kit.talk.start('rehber_zeynep');
    engine.controls.getDialogue = vi.fn(() => kit.talk.view());
    engine.controls.chooseDialogue = vi.fn((n) => kit.talk.choose(n));
    engine.controls.closeDialogue = vi.fn(() => { kit.talk.close('kapat'); engine.setUi('none'); return true; });
    engine.controls.getLockPanel = vi.fn(() => null);
    mountScreen();
    await ready();
    act(() => engine.setUi('dialogue'));
    const dlg = await screen.findByRole('dialog', { name: 'Zeynep' });
    expect(dlg).toBeInTheDocument();
    expect(screen.getByTestId('dialogue-live')).toHaveTextContent('Neon Meridyen\'e hoş geldin');
    fireEvent.click(screen.getByTestId('choice-1'));
    expect(engine.controls.chooseDialogue).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.getByTestId('dialogue-live')).toHaveTextContent('Kapı Meydanı'));
    fireEvent.click(screen.getByTestId('dialogue-close'));
    expect(engine.controls.closeDialogue).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('dialogue-sheet')).toBeNull());
  });

  it("ui 'dialogue' iken motor getDialogue null dönerse (kilit paneli sahibi) hiçbir NPC sayfası çizilmez", async () => {
    engine.controls.getDialogue = vi.fn(() => null);
    engine.controls.getLockPanel = vi.fn(() => null);
    mountScreen();
    await ready();
    act(() => engine.setUi('dialogue'));
    await new Promise((r) => setTimeout(r, 150));
    expect(screen.queryByTestId('dialogue-sheet')).toBeNull();
  });

  it("ui 'vendor': VendorPanel getVendor görünümünü çizer; satın al vendorBuy'a gider; kapat closeVendor çağırır", async () => {
    const city = { kredi: 400 };
    const inv = new Inventory();
    const wallet = createWallet(() => city, null);
    const ctx = () => ({
      seed: 123456, dayN: 0, shop: shopOf(city), inv, wallet, isBound: () => false,
    });
    const state = { open: true, msg: '' };
    engine.controls.getVendor = vi.fn(() => (state.open ? Object.assign(vendorView(ctx(), 'kerem', { name: 'Kerem', title: 'Loft sahibi', brand: '' }), { msg: state.msg }) : null));
    engine.controls.vendorBuy = vi.fn((item, n) => { const r = buyFrom(ctx(), 'kerem', item, n); state.msg = r.message; return r; });
    engine.controls.vendorSell = vi.fn(() => ({ ok: false }));
    engine.controls.closeVendor = vi.fn(() => { state.open = false; engine.setUi('none'); return true; });
    mountScreen();
    await ready();
    act(() => engine.setUi('vendor'));
    const panel = await screen.findByTestId('vendor-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Kerem' })).toBeInTheDocument();
    const buy = document.querySelector('[data-testid^="buy-"]');
    fireEvent.click(buy);
    expect(engine.controls.vendorBuy).toHaveBeenCalled();
    await waitFor(() => expect(city.kredi).toBeLessThan(400));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(engine.controls.closeVendor).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('vendor-panel')).toBeNull());
  });
});
