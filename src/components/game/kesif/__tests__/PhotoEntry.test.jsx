// @vitest-environment jsdom
/*
 * Foto modu / şehir haritası GİRİŞ noktaları (photo_map): dokunmatik üst çubukta «Foto» (yalnız actions.openPhoto verilince), duraklatma menüsünde «Şehir Haritası» ve «Foto Modu»
 * (yalnız missionApi bu çağrıları taşıyorsa).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TouchControls from '../TouchControls.jsx';
import PauseMenu from '../PauseMenu.jsx';

afterEach(() => {
  cleanup();
});

describe('TouchControls: Foto düğmesi', () => {
  const base = () => ({
    pressButton: vi.fn(), pause: vi.fn(), openInventory: vi.fn(), openCrafting: vi.fn(), openMap: vi.fn(), toggleCamera: vi.fn(),
  });

  it('openPhoto verilmeyince (ana diyar) düğme yok; verilince 44 px çubukta görünür ve çağrılır', () => {
    const a = base();
    const { unmount } = render(<TouchControls actions={a} abilities={{}} />);
    expect(screen.queryByRole('button', { name: 'Foto' })).toBeNull();
    unmount();
    const b = Object.assign(base(), { openPhoto: vi.fn() });
    render(<TouchControls actions={b} abilities={{}} />);
    const btn = screen.getByRole('button', { name: 'Foto' });
    fireEvent.pointerDown(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(btn, { pointerId: 1, pointerType: 'touch' });
    fireEvent.click(btn);
    expect(b.openPhoto).toHaveBeenCalled();
    expect(b.pressButton).not.toHaveBeenCalledWith('photo', true);
    // sıra: Günlük ile Kamera arasında
    const names = screen.getAllByRole('button').map((x) => x.getAttribute('aria-label') || x.textContent);
    expect(names.indexOf('Foto')).toBeGreaterThan(names.indexOf('Harita'));
  });
});

describe('PauseMenu: Şehir Haritası ve Foto Modu', () => {
  const props = { settings: {}, onChange: () => {}, onResume: () => {}, onExit: () => {} };

  it('missionApi bu çağrıları taşırsa iki düğme görünür ve çağrılır; taşımazsa görünmez', () => {
    const api = {
      getMissionInfo: () => null, abandonMission: () => ({}), startRace: () => ({}), openCityMap: vi.fn(), photoOpen: vi.fn(),
    };
    const { unmount } = render(<PauseMenu {...props} missionApi={api} />);
    fireEvent.click(screen.getByTestId('kx-citymap-open'));
    expect(api.openCityMap).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('kx-photo-open'));
    expect(api.photoOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Şehir Haritası/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Foto Modu/ })).toBeTruthy();
    unmount();
    render(<PauseMenu {...props} missionApi={{ getMissionInfo: () => null, abandonMission: () => ({}), startRace: () => ({}) }} />);
    expect(screen.queryByTestId('kx-citymap-open')).toBeNull();
    expect(screen.queryByTestId('kx-photo-open')).toBeNull();
    cleanup();
    render(<PauseMenu {...props} />);
    expect(screen.queryByTestId('kx-citymap-open')).toBeNull();
    expect(screen.queryByTestId('kx-missions-open')).toBeNull();
  });
});
