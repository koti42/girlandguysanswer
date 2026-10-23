// @vitest-environment jsdom
/*
 * Faz 5 / mobile_bridge: Android geri tuşu (native 'back' → actions.handleBack) Neon Meridyen pencerelerinde EN ÜSTTEKİ pencereyi kapatır;
 * duraklatma menüsü açmaz, çıkış onayı istemez, oyundan çıkmaz. Pencere yokken (araç sürerken dahil) oyun duraklar; menüde çıkış onayı açılır.
 * Mevcut KesifGameScreen.test.jsx değişmeden geçer (orada panel kümesi: envanter/üretim/harita/… ).
 */
import React, { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

configure({ asyncUtilTimeout: 4000 });
vi.setConfig({ testTimeout: 20000 });

vi.mock('../../../../game/kesif/render/itemIcons.js', () => ({ renderItemIcon: () => 'data:image/png;base64,AAAA' }));
vi.mock('../engineLoader', () => ({ loadKesifEngine: vi.fn() }));

import { loadKesifEngine } from '../engineLoader';
import KesifGameScreen from '../KesifGameScreen';
import { fakeApi } from '../../../../components/game/kesif/__tests__/kesifTestKit';
import { makeEngine } from './fakeKesifEngine';

const MACERA = { mode: 'macera', seed: 'ABCD1234', mapId: null, saveId: null, base: null };
let engine;

async function ready() {
  await waitFor(() => expect(engine.controls.start).toHaveBeenCalled());
  act(() => engine.cb.onReady());
  await waitFor(() => expect(screen.queryByTestId('kesif-loading')).toBeNull());
}

describe('geri tuşu: Neon Meridyen pencereleri', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    engine = makeEngine();
    loadKesifEngine.mockResolvedValue(engine.mod);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(async () => {
    cleanup();
    await new Promise((r) => setTimeout(r, 5));
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  const mount = (onExit = () => {}) => {
    const sessionRef = createRef();
    render(
      <MemoryRouter>
        <KesifGameScreen entry={MACERA} user={null} avatar={null} api={fakeApi()} onExit={onExit} sessionRef={sessionRef} />
      </MemoryRouter>,
    );
    return sessionRef;
  };

  it.each(['dialogue', 'vendor', 'garage', 'photo'])('%s açıkken geri: closeUi çağrılır; duraklatma/çıkış onayı/çıkış yok', async (ui) => {
    const onExit = vi.fn();
    const sessionRef = mount(onExit);
    await ready();
    act(() => engine.setUi(ui));
    engine.controls.closeUi.mockClear();
    engine.controls.pause.mockClear();
    act(() => {
      expect(sessionRef.current.actions.handleBack()).toBe(true);
    });
    expect(engine.controls.closeUi).toHaveBeenCalledTimes(1);
    expect(engine.controls.pause).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('pencere kapandıktan sonra (araç sürerken de: ui none) geri oyunu duraklatır; menüde çıkış onayı, bir daha geri onayı kapatır', async () => {
    const onExit = vi.fn();
    const sessionRef = mount(onExit);
    await ready();
    act(() => engine.setUi('photo'));
    act(() => {
      sessionRef.current.actions.handleBack(); // foto kapanır (fake closeUi → ui none)
    });
    engine.controls.pause.mockClear();
    act(() => {
      sessionRef.current.actions.handleBack(); // ui none → duraklat
    });
    expect(engine.controls.pause).toHaveBeenCalledTimes(1);
    act(() => {
      sessionRef.current.actions.handleBack(); // pause menüsü → çıkış onayı
    });
    expect(screen.getByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeInTheDocument();
    act(() => {
      sessionRef.current.actions.handleBack(); // onayı kapat
    });
    expect(screen.queryByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('yükleme göstergesi (loading) ve ölüm ekranında geri çıkış yapmaz', async () => {
    const onExit = vi.fn();
    const sessionRef = mount(onExit);
    await ready();
    for (const ui of ['loading', 'dead']) {
      engine.controls.closeUi.mockClear();
      engine.controls.pause.mockClear();
      act(() => engine.setUi(ui));
      act(() => {
        sessionRef.current.actions.handleBack();
      });
      expect(engine.controls.pause).not.toHaveBeenCalled();
    }
    expect(onExit).not.toHaveBeenCalled();
  });
});
