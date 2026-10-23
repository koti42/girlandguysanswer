// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ZoneBanner from '../ZoneBanner.jsx';
import VictoryScreen from '../VictoryScreen.jsx';
import Minimap from '../Minimap.jsx';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ZoneBanner', () => {
  it('banner yoksa yalnızca boş canlı bölge çizer', () => {
    const { container } = render(<ZoneBanner banner={null} toasts={[]} />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(container.querySelector('.kx-banner')).toBeNull();
  });

  it('banner metni ve alt metni; until=0 süresiz', () => {
    render(<ZoneBanner banner={{ text: 'Donmuş Zirveler', sub: 'Soğuk bir rüzgâr esiyor', until: 0 }} />);
    expect(screen.getByRole('heading', { name: 'Donmuş Zirveler' })).toBeInTheDocument();
    expect(screen.getByText('Soğuk bir rüzgâr esiyor')).toBeInTheDocument();
  });

  it('bildirimler süre dolunca onDismiss(id) çağırır; sessiz olanlar daha çabuk', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const toasts = [
      { id: 1, kind: 'achievement', text: 'Başarım kazandın', sub: 'İlk adım', quiet: false },
      { id: 2, kind: 'info', text: 'Oyun kaydedildi', sub: '', quiet: true },
    ];
    render(<ZoneBanner banner={null} toasts={toasts} onDismiss={onDismiss} />);
    expect(screen.getByText('İlk adım')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(2);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onDismiss).toHaveBeenLastCalledWith(1);
  });
});

describe('VictoryScreen', () => {
  const stats = { playTime: 7500, mobsKilled: 120, blocksBroken: 4521, distance: 18234, deaths: 3, achievements: 18 };

  it('başlık, istatistik özeti ve düğmeler', () => {
    const onContinue = vi.fn();
    const onExit = vi.fn();
    render(<VictoryScreen stats={stats} worldName="Gölge Diyarı" onContinue={onContinue} onExit={onExit} />);
    const dlg = screen.getByRole('dialog', { name: 'Dünya Fethedildi' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(dlg).toHaveTextContent('Gölge Diyarı artık senin');
    const list = screen.getByRole('list', { name: 'Macera özeti' });
    expect(list).toHaveTextContent('2 sa 5 dk');
    expect(list).toHaveTextContent('4.521');
    expect(list).toHaveTextContent('18.234 blok');
    expect(list).toHaveTextContent('Yenilen yaratık');
    expect(screen.getByRole('button', { name: /Keşfetmeye devam et/ })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: /Keşfetmeye devam et/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Çık' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('verilmeyen istatistikler gösterilmez; istatistik yoksa liste yok', () => {
    const { rerender } = render(<VictoryScreen stats={{ playTime: 60 }} onContinue={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    rerender(<VictoryScreen stats={null} onContinue={() => {}} />);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çık' })).toBeNull();
  });
});

describe('Minimap', () => {
  let ctx;
  let origGet;
  beforeEach(() => {
    ctx = {
      calls: 0,
      setTransform: vi.fn(),
      clearRect: vi.fn(function () {
        ctx.calls++;
      }),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      setLineDash: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      fillText: vi.fn(),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: vi.fn(),
    };
    origGet = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => ctx;
    const rafs = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafs.push(cb);
      return rafs.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    globalThis.__rafs = rafs;
  });
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGet;
    delete globalThis.__rafs;
  });

  const flush = (ts) => {
    const run = globalThis.__rafs.splice(0);
    act(() => run.forEach((cb) => cb(ts)));
  };

  const info = (x, yaw = 0) => ({
    zone: { id: 0, name: 'Başlangıç' },
    size: 400,
    player: { x, z: 0, yaw },
    spawn: { x: 0, z: 0 },
    tiles: { w: 4, h: 4, data: new Uint8Array(16).fill(1), palette: ['#000', '#3a8f3a'] },
    markers: [],
  });

  it('getMapInfo düşük sıklıkta okunur; yalnız konum/yön değişince yeniden çizilir', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    let cur = info(0);
    const getMapInfo = vi.fn(() => cur);
    render(<Minimap getMapInfo={getMapInfo} pollMs={300} />);
    expect(getMapInfo).toHaveBeenCalledTimes(1);
    flush(100);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalled(); // döşemeler boyandı
    flush(200);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1); // değişmedi → çizim yok
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(getMapInfo.mock.calls.length).toBeGreaterThanOrEqual(3);
    cur = info(5, 0.5);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    flush(400);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
  });

  it('getPose ile kare başına akıcı yön; paused iken hiçbir iş yapılmaz', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    let yaw = 0;
    const getPose = vi.fn(() => ({ x: 0, z: 0, yaw }));
    const getMapInfo = vi.fn(() => info(0));
    const { rerender } = render(<Minimap getMapInfo={getMapInfo} getPose={getPose} />);
    flush(100);
    yaw = 1;
    flush(200);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    expect(ctx.rotate).toHaveBeenCalledWith(1);
    getMapInfo.mockClear();
    rerender(<Minimap getMapInfo={getMapInfo} getPose={getPose} paused />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(getMapInfo).not.toHaveBeenCalled();
  });

  it('onOpen verilirse düğme, yoksa img rolü; erişilebilir ad', () => {
    const onOpen = vi.fn();
    const { rerender } = render(<Minimap getMapInfo={() => null} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Mini harita/ }));
    expect(onOpen).toHaveBeenCalled();
    rerender(<Minimap getMapInfo={() => null} />);
    expect(screen.getByRole('img', { name: /Mini harita/ })).toBeInTheDocument();
  });

  it('getMapInfo hata fırlatsa da bileşen düşmez', () => {
    expect(() =>
      render(
        <Minimap
          getMapInfo={() => {
            throw new Error('x');
          }}
        />
      )
    ).not.toThrow();
  });
});
