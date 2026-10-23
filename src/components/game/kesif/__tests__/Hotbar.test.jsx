// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Hotbar from '../Hotbar.jsx';

const iconFor = (key) => 'data:image/png;base64,' + key.length;

const SLOTS = [
  { item: 'item:kazma_demir', count: 1, dur: 0.4 },
  { item: 'item:yay', count: 1 },
  { item: 'blok:taş', count: 64 },
  ...Array.from({ length: 6 }, () => ({ item: null, count: 0 })),
];

describe('Hotbar', () => {
  it('9 yuva çizer; ad, adet ve dayanıklılık erişilebilir etikette', () => {
    render(<Hotbar slots={SLOTS} selected={1} onSelect={() => {}} iconFor={iconFor} />);
    expect(screen.getByRole('toolbar', { name: 'Eşya çubuğu' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(screen.getByRole('button', { name: /1\. yuva: .*dayanıklılık yüzde 40/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2. yuva: Yay' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /3\. yuva: .*64 adet/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '9. yuva: boş' })).toBeInTheDocument();
    expect(screen.getByText('64')).toBeInTheDocument();
  });

  it('simge, kayıtlı simge dataURL ya da üretici işlevden gelir', () => {
    const { container } = render(<Hotbar slots={[{ item: 'item:yay', count: 1, icon: 'data:image/png;base64,KAYITLI' }, { item: 'blok:taş', count: 2 }]} selected={0} iconFor={iconFor} />);
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,KAYITLI');
    expect(imgs[1].getAttribute('src')).toBe(iconFor('blok:taş'));
  });

  it('simge üretilemezse ilk harf yedek olarak görünür', () => {
    const { container } = render(<Hotbar slots={[{ item: 'item:yay', count: 1 }]} selected={0} iconFor={() => ''} />);
    expect(container.querySelector('.kx-slot-glyph')).toHaveTextContent('Y');
  });

  it('dokunma/tıklama onSelect(index) çağırır', () => {
    const onSelect = vi.fn();
    render(<Hotbar slots={SLOTS} selected={0} onSelect={onSelect} iconFor={iconFor} />);
    fireEvent.click(screen.getByRole('button', { name: /3. yuva: Taş, 64 adet/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('rakam ipuçları yalnız showKeys iken görünür', () => {
    const { container, rerender } = render(<Hotbar slots={SLOTS} selected={0} iconFor={iconFor} showKeys />);
    expect(container.querySelectorAll('.kx-slot-key')).toHaveLength(9);
    rerender(<Hotbar slots={SLOTS} selected={0} iconFor={iconFor} showKeys={false} />);
    expect(container.querySelectorAll('.kx-slot-key')).toHaveLength(0);
  });

  it('yalnız seçili yuva sekmeye girer; ok tuşları seçimi ilerletir ve sarar', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<Hotbar slots={SLOTS} selected={8} onSelect={onSelect} iconFor={iconFor} />);
    const btns = screen.getAllByRole('button');
    expect(btns.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    fireEvent.keyDown(btns[8], { key: 'ArrowRight' });
    expect(onSelect).toHaveBeenLastCalledWith(0);
    rerender(<Hotbar slots={SLOTS} selected={0} onSelect={onSelect} iconFor={iconFor} />);
    fireEvent.keyDown(screen.getAllByRole('button')[0], { key: 'ArrowLeft' });
    expect(onSelect).toHaveBeenLastCalledWith(8);
  });

  it('dokunmatik yatay kaydırma yuva değiştirir ve sonraki tıklamayı yutar', () => {
    const onSelect = vi.fn();
    render(<Hotbar slots={SLOTS} selected={3} onSelect={onSelect} iconFor={iconFor} />);
    const bar = screen.getByRole('toolbar');
    fireEvent.pointerDown(bar, { pointerId: 7, pointerType: 'touch', clientX: 200 });
    fireEvent.pointerMove(bar, { pointerId: 7, pointerType: 'touch', clientX: 130 }); // sola 70px → +2
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(4); // selected prop sabit (3) → 3+1
    fireEvent.pointerUp(bar, { pointerId: 7, pointerType: 'touch' });
    onSelect.mockClear();
    fireEvent.click(screen.getAllByRole('button')[0]); // kaydırma sonrası ilk tıklama yutulur
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(onSelect).toHaveBeenCalledWith(0);
  });

  it('fare işaretçisi kaydırma sayılmaz', () => {
    const onSelect = vi.fn();
    render(<Hotbar slots={SLOTS} selected={3} onSelect={onSelect} iconFor={iconFor} />);
    const bar = screen.getByRole('toolbar');
    fireEvent.pointerDown(bar, { pointerId: 1, pointerType: 'mouse', clientX: 200 });
    fireEvent.pointerMove(bar, { pointerId: 1, pointerType: 'mouse', clientX: 100 });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('boş/eksik slots dizisiyle de 9 boş yuva çizer', () => {
    render(<Hotbar slots={undefined} selected={0} iconFor={iconFor} />);
    expect(screen.getAllByRole('button')).toHaveLength(9);
  });
});
