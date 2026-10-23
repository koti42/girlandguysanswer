// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import QuestTracker from '../QuestTracker.jsx';
import BossBar from '../BossBar.jsx';
import DeathScreen from '../DeathScreen.jsx';

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    // yok say
  }
});
afterEach(() => {
  vi.useRealTimers();
});

describe('QuestTracker', () => {
  const quest = { title: 'İlk Tapınak', lines: ['✓ Tezgah yap', 'Demir kazma üret', '[x] Maden bul'] };

  it('başlık ve satırlar; tamamlananlar işaretli', () => {
    render(<QuestTracker quest={quest} />);
    expect(screen.getByRole('region', { name: 'Görev izleyici' })).toBeInTheDocument();
    expect(screen.getByText('İlk Tapınak')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute('data-done', '1');
    expect(items[1]).toHaveAttribute('data-done', '0');
    expect(items[0]).toHaveTextContent('Tamamlandı: Tezgah yap');
  });

  it('başlık ve satır yoksa hiçbir şey çizmez', () => {
    const { container } = render(<QuestTracker quest={{ title: '', lines: [] }} />);
    expect(container).toBeEmptyDOMElement();
    const r = render(<QuestTracker quest={null} />);
    expect(r.container).toBeEmptyDOMElement();
  });

  it('daraltma düğmesi aria-expanded değiştirir ve tercihi saklar', () => {
    const { unmount } = render(<QuestTracker quest={quest} />);
    const head = screen.getByRole('button', { name: /İlk Tapınak/ });
    expect(head).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    unmount();
    // Tercih hatırlanır: yeniden açılışta daraltılmış başlar.
    render(<QuestTracker quest={quest} />);
    expect(screen.getByRole('button', { name: /İlk Tapınak/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('kayıtlı tercih yoksa defaultCollapsed uygulanır', () => {
    render(<QuestTracker quest={quest} defaultCollapsed />);
    expect(screen.getByRole('button', { name: /İlk Tapınak/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('daraltılmışken yeni görev gelirse "Yeni görev" noktası yanar, açınca söner', () => {
    const { rerender } = render(<QuestTracker quest={quest} defaultCollapsed />);
    expect(screen.queryByText('Yeni görev')).toBeNull();
    rerender(<QuestTracker quest={{ title: 'Ormanın Sırrı', lines: [] }} defaultCollapsed />);
    expect(screen.getByText('Yeni görev')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Ormanın Sırrı/ }));
    expect(screen.queryByText('Yeni görev')).toBeNull();
  });

  it('ipucu düğmesi onHint metnini gösterir, 9 sn sonra kaldırır; ipucu yoksa nazik mesaj', () => {
    vi.useFakeTimers();
    const onHint = vi.fn(() => 'Rün taşlarının renklerine bak.');
    const { rerender } = render(<QuestTracker quest={quest} onHint={onHint} />);
    fireEvent.click(screen.getByRole('button', { name: /İpucu/ }));
    expect(onHint).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Rün taşlarının renklerine bak.');
    act(() => {
      vi.advanceTimersByTime(9100);
    });
    expect(screen.queryByText('Rün taşlarının renklerine bak.')).toBeNull();
    rerender(<QuestTracker quest={quest} onHint={() => null} />);
    fireEvent.click(screen.getByRole('button', { name: /İpucu/ }));
    expect(screen.getByText(/Şimdilik bir ipucu yok/)).toBeInTheDocument();
  });

  it('onHint verilmezse ipucu düğmesi yok', () => {
    render(<QuestTracker quest={quest} />);
    expect(screen.queryByRole('button', { name: /İpucu/ })).toBeNull();
  });
});

describe('BossBar', () => {
  it('boss yoksa çizmez', () => {
    const { container } = render(<BossBar boss={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ad, can yüzdesi ve aşama', () => {
    render(<BossBar boss={{ name: 'Kök Ana', hp: 150, maxHp: 300 }} />);
    expect(screen.getAllByText(/Kök Ana/).length).toBeGreaterThan(0);
    const bar = screen.getByRole('progressbar', { name: 'Kök Ana canı' });
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    expect(bar).toHaveAttribute('aria-valuetext', 'Yüzde 50');
    expect(screen.getByText('Aşama 2/3')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Boss: Kök Ana' })).toHaveAttribute('data-phase', '2');
  });

  it('aşama noktaları: biten/şimdiki/sonraki', () => {
    const { container, rerender } = render(<BossBar boss={{ name: 'B', hp: 100, maxHp: 100 }} />);
    const states = () => Array.from(container.querySelectorAll('.kx-boss-pip')).map((p) => p.getAttribute('data-state'));
    expect(states()).toEqual(['now', 'next', 'next']);
    rerender(<BossBar boss={{ name: 'B', hp: 10, maxHp: 100 }} />);
    expect(states()).toEqual(['done', 'done', 'now']);
    expect(container.querySelectorAll('.kx-boss-mark')).toHaveLength(2);
  });

  it('can çubuğu genişliği yüzdeye bağlı; sınırlar aşılmaz', () => {
    const { container } = render(<BossBar boss={{ name: 'B', hp: 999, maxHp: 100 }} />);
    expect(container.querySelector('.kx-boss-fill').style.width).toBe('100%');
    const r = render(<BossBar boss={{ name: 'B', hp: -5, maxHp: 100 }} />);
    expect(r.container.querySelector('.kx-boss-fill').style.width).toBe('0%');
  });

  it('özel aşama sayısı', () => {
    render(<BossBar boss={{ name: 'B', hp: 25, maxHp: 100 }} phases={4} />);
    expect(screen.getByText('Aşama 4/4')).toBeInTheDocument();
  });
});

describe('DeathScreen', () => {
  it('başlık, neden ve kayıp eşya notu', () => {
    render(<DeathScreen reason={{ cause: 'lava' }} lostCount={5} guardMs={0} onRespawn={() => {}} />);
    const dlg = screen.getByRole('dialog', { name: 'Bitkin düştün' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Lavın içine düştün.')).toBeInTheDocument();
    expect(dlg).toHaveTextContent('5 dakika bekliyor');
  });

  it('kolay modda ya da kayıp yoksa eşya kaybı notu çıkmaz', () => {
    const { rerender } = render(<DeathScreen reason="x" lostCount={9} easy guardMs={0} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Eşyaların yanında');
    rerender(<DeathScreen reason="x" lostCount={0} guardMs={0} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Eşyaların yanında');
  });

  it('Yeniden Doğ: odakta, tıklayınca onRespawn çağrılır', () => {
    const onRespawn = vi.fn();
    render(<DeathScreen reason="x" guardMs={0} onRespawn={onRespawn} />);
    const btn = screen.getByRole('button', { name: 'Yeniden Doğ' });
    expect(btn).toHaveFocus();
    fireEvent.click(btn);
    expect(onRespawn).toHaveBeenCalledTimes(1);
  });

  it('koruma süresi dolmadan tıklama yok sayılır, sonra çalışır', () => {
    vi.useFakeTimers();
    const onRespawn = vi.fn();
    render(<DeathScreen reason="x" guardMs={700} onRespawn={onRespawn} />);
    const btn = screen.getByRole('button', { name: 'Yeniden Doğ' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(onRespawn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(750);
    });
    expect(btn).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(btn);
    expect(onRespawn).toHaveBeenCalledTimes(1);
  });

  it('meşgulken tıklama yok sayılır; çıkış düğmesi yalnız onExit varsa', () => {
    const onRespawn = vi.fn();
    const onExit = vi.fn();
    const { rerender } = render(<DeathScreen reason="x" guardMs={0} busy onRespawn={onRespawn} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden Doğ' }));
    expect(onRespawn).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Çıkış/ })).toBeNull();
    rerender(<DeathScreen reason="x" guardMs={0} onRespawn={onRespawn} onExit={onExit} />);
    fireEvent.click(screen.getByRole('button', { name: /Çıkış/ }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('Tab odağı iletişim kutusunda döner', () => {
    render(<DeathScreen reason="x" guardMs={0} onRespawn={() => {}} onExit={() => {}} />);
    const btns = screen.getAllByRole('button');
    btns[btns.length - 1].focus();
    fireEvent.keyDown(btns[btns.length - 1], { key: 'Tab' });
    expect(btns[0]).toHaveFocus();
  });
});
