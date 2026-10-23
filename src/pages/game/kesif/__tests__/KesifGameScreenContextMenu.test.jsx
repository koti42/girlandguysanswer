// @vitest-environment jsdom
/*
 * KesifGameScreen: sağ tık oyun eylemidir; tarayıcı sağ tık menüsü oyun çalışırken hiçbir oyun öğesinde (sahne, HUD, paneller,
 * portal katmanları) açılmamalı. Yazı alanlarında menü açık kalır; oyun kapanınca dinleyici kalkar.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

function mountScreen() {
  return render(
    <MemoryRouter>
      <KesifGameScreen entry={MACERA} user={null} avatar={null} api={fakeApi()} onExit={() => {}} />
    </MemoryRouter>,
  );
}

describe('KesifGameScreen: tarayıcı sağ tık menüsü', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    engine = makeEngine();
    loadKesifEngine.mockResolvedValue(engine.mod);
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => cleanup());

  it('oyun çalışırken sahnede, HUD/panel alanında ve belge gövdesinde engellenir', async () => {
    const { container } = mountScreen();
    await ready();
    const stage = screen.getByTestId('kesif-stage');
    expect(fireEvent.contextMenu(stage)).toBe(false);
    expect(fireEvent.contextMenu(container.querySelector('.kxp-root'))).toBe(false);
    expect(fireEvent.contextMenu(document.body)).toBe(false);
    const portalLike = document.createElement('div');
    document.body.appendChild(portalLike);
    expect(fireEvent.contextMenu(portalLike)).toBe(false);
    portalLike.remove();
  });

  it('yazı alanlarında menü açık kalır (yapıştır/kopyala)', async () => {
    mountScreen();
    await ready();
    for (const tag of ['input', 'textarea', 'select']) {
      const el = document.createElement(tag);
      document.body.appendChild(el);
      expect(fireEvent.contextMenu(el), tag).toBe(true);
      el.remove();
    }
    const ce = document.createElement('div');
    ce.setAttribute('contenteditable', 'true');
    document.body.appendChild(ce);
    expect(fireEvent.contextMenu(ce)).toBe(true);
    ce.remove();
  });

  it('oyun kapanınca dinleyici kalkar', async () => {
    const { unmount } = mountScreen();
    await ready();
    unmount();
    expect(fireEvent.contextMenu(document.body)).toBe(true);
  });
});
