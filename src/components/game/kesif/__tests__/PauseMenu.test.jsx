// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PauseMenu from '../PauseMenu.jsx';

const base = () => ({
  onResume: vi.fn(),
  onSave: vi.fn(() => true),
  onExit: vi.fn(),
  onChange: vi.fn(),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: /Ayarlar/ }));
}

describe('PauseMenu: ana menü', () => {
  it('role=dialog, aria-modal ve ilk düğmeye odak', () => {
    render(<PauseMenu {...base()} />);
    const dlg = screen.getByRole('dialog', { name: 'Duraklatıldı' });
    expect(dlg).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /Devam et/ })).toHaveFocus();
  });

  it('devam et onResume çağırır', () => {
    const p = base();
    render(<PauseMenu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Devam et/ }));
    expect(p.onResume).toHaveBeenCalledTimes(1);
  });

  it('kaydet: onSave çağrılır, durum "Kaydedildi" olur; hata "Kaydedilemedi"', async () => {
    const p = base();
    const { unmount } = render(<PauseMenu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /^Kaydet$/ }));
    expect(p.onSave).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: /Kaydedildi/ })).toBeInTheDocument();
    unmount();

    const q = { ...base(), onSave: vi.fn(() => Promise.reject(new Error('x'))) };
    render(<PauseMenu {...q} />);
    fireEvent.click(screen.getByRole('button', { name: /^Kaydet$/ }));
    expect(await screen.findByRole('button', { name: /Kaydedilemedi/ })).toBeInTheDocument();
  });

  it('harita modunda kaydet gizli; inşa modunda yayınla ve "Haritayı kaydet"', () => {
    const p = base();
    const { rerender } = render(<PauseMenu {...p} mode="harita" />);
    expect(screen.queryByRole('button', { name: /Kaydet/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /yayınla/ })).toBeNull();
    const onPublish = vi.fn();
    rerender(<PauseMenu {...p} mode="insa" onPublish={onPublish} />);
    expect(screen.getByRole('button', { name: /Haritayı kaydet/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Haritayı yayınla/ }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('dünya kodunu panoya kopyalar ve bildirir', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<PauseMenu {...base()} worldCode="K7P2QX9A" />);
    fireEvent.click(screen.getByRole('button', { name: /Dünya kodunu kopyala/ }));
    expect(writeText).toHaveBeenCalledWith('K7P2QX9A');
    expect(await screen.findByRole('button', { name: /Kopyalandı/ })).toBeInTheDocument();
  });

  it('özel onCopyCode verilirse o kullanılır; başarısızsa uyarı', async () => {
    const onCopyCode = vi.fn(() => false);
    render(<PauseMenu {...base()} worldCode="ABC" onCopyCode={onCopyCode} />);
    fireEvent.click(screen.getByRole('button', { name: /Dünya kodunu kopyala/ }));
    expect(onCopyCode).toHaveBeenCalledWith('ABC');
    expect(await screen.findByRole('button', { name: /Kopyalanamadı/ })).toBeInTheDocument();
  });

  it('dünya kodu yoksa kopyalama düğmesi yok', () => {
    render(<PauseMenu {...base()} />);
    expect(screen.queryByRole('button', { name: /kopyala/i })).toBeNull();
  });
});

describe('PauseMenu: ayarlar', () => {
  it('anahtarlar role=switch; tıklayınca onChange yaması gider ve durum yansır', () => {
    const p = base();
    render(<PauseMenu {...p} settings={{ invertY: false, music: true, muted: false }} />);
    openSettings();
    const invert = screen.getByRole('switch', { name: 'Dikey bakışı ters çevir' });
    expect(invert).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(invert);
    expect(p.onChange).toHaveBeenLastCalledWith({ invertY: true });
    expect(invert).toHaveAttribute('aria-checked', 'true');

    const sound = screen.getByRole('switch', { name: 'Ses efektleri' });
    expect(sound).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sound);
    expect(p.onChange).toHaveBeenLastCalledWith({ muted: true });
    expect(sound).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByRole('switch', { name: 'Müzik' }));
    expect(p.onChange).toHaveBeenLastCalledWith({ music: false });
    fireEvent.click(screen.getByRole('switch', { name: 'Kolay mod' }));
    expect(p.onChange).toHaveBeenLastCalledWith({ easy: true });
  });

  it('kaydırıcılar sınırlanmış değer gönderir; görünen değer güncellenir', () => {
    const p = base();
    render(<PauseMenu {...p} settings={{ fov: 70, sensitivity: 1 }} />);
    openSettings();
    const fov = screen.getByLabelText('Görüş açısı');
    expect(fov).toHaveAttribute('aria-valuetext', '70°');
    fireEvent.change(fov, { target: { value: '90' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ fov: 90 });
    expect(screen.getByLabelText('Görüş açısı')).toHaveAttribute('aria-valuetext', '90°');
    const sens = screen.getByLabelText('Bakış hassasiyeti');
    expect(sens).toHaveAttribute('aria-valuetext', '100%');
    fireEvent.change(sens, { target: { value: '1.5' } });
    expect(p.onChange).toHaveBeenLastCalledWith({ sensitivity: 1.5 });
  });

  it('kalite seçimi aria-pressed ile', () => {
    const p = base();
    render(<PauseMenu {...p} settings={{ quality: 'auto' }} />);
    openSettings();
    const group = screen.getByRole('group', { name: 'Grafik kalitesi' });
    expect(within(group).getByRole('button', { name: 'Otomatik' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(group).getByRole('button', { name: 'Yüksek' }));
    expect(p.onChange).toHaveBeenLastCalledWith({ quality: 'high' });
    expect(within(group).getByRole('button', { name: 'Yüksek' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('dokunmatik ayarlar yalnız touch iken görünür', () => {
    const p = base();
    const { rerender } = render(<PauseMenu {...p} touch={false} />);
    openSettings();
    expect(screen.queryByRole('switch', { name: 'Sol elli düzen' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Titreşim' })).toBeNull();
    expect(screen.queryByRole('switch', { name: 'Jiroskopla bak' })).toBeNull();
    rerender(<PauseMenu {...p} touch />);
    fireEvent.click(screen.getByRole('switch', { name: 'Sol elli düzen' }));
    expect(p.onChange).toHaveBeenLastCalledWith({ leftHanded: true });
    expect(screen.getByLabelText('Joystick boyutu')).toBeInTheDocument();
    expect(screen.getByLabelText('Düğme saydamlığı')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Titreşim' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Jiroskopla bak' })).toBeInTheDocument();
  });

  it('jiroskop desteği yoksa anahtar gizlenir', () => {
    render(<PauseMenu {...base()} touch gyroSupported={false} />);
    openSettings();
    expect(screen.queryByRole('switch', { name: 'Jiroskopla bak' })).toBeNull();
  });

  it('geri düğmesi ana menüye döner ve odak taşınır', () => {
    render(<PauseMenu {...base()} />);
    openSettings();
    expect(screen.getByRole('dialog', { name: 'Ayarlar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Geri' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Devam et/ })).toHaveFocus();
  });

  it('dışarıdan gelen ayar değişimi yansır', () => {
    const { rerender } = render(<PauseMenu {...base()} settings={{ easy: false }} />);
    openSettings();
    expect(screen.getByRole('switch', { name: 'Kolay mod' })).toHaveAttribute('aria-checked', 'false');
    rerender(<PauseMenu {...base()} settings={{ easy: true }} />);
    expect(screen.getByRole('switch', { name: 'Kolay mod' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('PauseMenu: odak tuzağı', () => {
  it('Tab sonuncudan ilke, Shift+Tab ilkten sonuncuya sarar', () => {
    render(<PauseMenu {...base()} worldCode="ABC" />);
    const dlg = screen.getByRole('dialog');
    const buttons = within(dlg).getAllByRole('button');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('ayarlar sayfasında da odak kapsayıcıda kalır', () => {
    render(<PauseMenu {...base()} touch />);
    openSettings();
    const dlg = screen.getByRole('dialog');
    const items = dlg.querySelectorAll('button, input');
    const last = items[items.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });

  it('kapanınca odak önceki öğeye döner', () => {
    const outer = document.createElement('button');
    document.body.appendChild(outer);
    outer.focus();
    const { unmount } = render(<PauseMenu {...base()} />);
    expect(outer).not.toHaveFocus();
    unmount();
    expect(outer).toHaveFocus();
    outer.remove();
  });
});

describe('PauseMenu: çıkış onayı', () => {
  it('çıkış önce onay ister; vazgeç ana menüye döner', () => {
    const p = base();
    render(<PauseMenu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Çıkış/ }));
    expect(p.onExit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Çıkmak istiyor musun?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.getByRole('dialog', { name: 'Duraklatıldı' })).toBeInTheDocument();
  });

  it('kaydetmeden çık yalnız onExit çağırır', () => {
    const p = base();
    render(<PauseMenu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Çıkış/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kaydetmeden çık/ }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
    expect(p.onSave).not.toHaveBeenCalled();
  });

  it('kaydet ve çık: önce kaydeder, sonra çıkar', async () => {
    const order = [];
    const p = { ...base(), onSave: vi.fn(async () => order.push('save')), onExit: vi.fn(() => order.push('exit')) };
    render(<PauseMenu {...p} />);
    fireEvent.click(screen.getByRole('button', { name: /Çıkış/ }));
    fireEvent.click(screen.getByRole('button', { name: /Kaydet ve çık/ }));
    await waitFor(() => expect(p.onExit).toHaveBeenCalled());
    expect(order).toEqual(['save', 'exit']);
  });

  it('harita modunda onay kaydetmeyi sunmaz', () => {
    const p = base();
    render(<PauseMenu {...p} mode="harita" />);
    fireEvent.click(screen.getByRole('button', { name: /Çıkış/ }));
    expect(screen.queryByRole('button', { name: /Kaydet/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Çık$/ }));
    expect(p.onExit).toHaveBeenCalledTimes(1);
  });
});

describe('PauseMenu: harita raporlama (Play UGC kuralı)', () => {
  it('onReport yoksa raporla düğmesi görünmez', () => {
    render(<PauseMenu {...base()} mode="harita" />);
    expect(screen.queryByRole('button', { name: /Haritayı raporla/ })).toBeNull();
  });

  it('neden seçilmeden gönderilemez; seçince onReport(anahtar) çağrılır ve teşekkür gösterilir', async () => {
    const onReport = vi.fn(() => Promise.resolve(true));
    render(<PauseMenu {...base()} mode="harita" onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /Haritayı raporla/ }));
    const send = screen.getByRole('button', { name: /^Gönder$/ });
    expect(send).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: /Uygunsuz içerik/ }));
    expect(screen.getByRole('radio', { name: /Uygunsuz içerik/ })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(send);
    await waitFor(() => expect(onReport).toHaveBeenCalledWith('uygunsuz'));
    expect(await screen.findByText(/Teşekkürler/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gönder$/ })).toBeNull();
  });

  it('hata olursa mesaj gösterilir ve yeniden denenebilir', async () => {
    const onReport = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<PauseMenu {...base()} mode="harita" onReport={onReport} />);
    fireEvent.click(screen.getByRole('button', { name: /Haritayı raporla/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Spam/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Gönder$/ }));
    expect(await screen.findByText(/Rapor gönderilemedi/, { selector: 'p.kx-sub' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Gönder$/ }));
    expect(await screen.findByText(/Teşekkürler/)).toBeInTheDocument();
    expect(onReport).toHaveBeenCalledTimes(2);
  });

  it('geri düğmesi ana menüye döner', () => {
    render(<PauseMenu {...base()} mode="harita" onReport={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Haritayı raporla/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Geri' }));
    expect(screen.getByRole('heading', { name: 'Duraklatıldı' })).toBeInTheDocument();
  });
});

describe('PauseMenu: günün saati (inşa)', () => {
  it('yalnız inşa modunda ve onMapTime verilirse görünür; mevcut saat HUD metninden seçili gelir', () => {
    const { rerender } = render(<PauseMenu {...base()} mode="insa" onMapTime={vi.fn()} mapTime="gün batımı 18:00" />);
    const group = screen.getByRole('group', { name: 'Günün saati' });
    expect(within(group).getByRole('button', { name: 'Gün batımı' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Gece' })).toHaveAttribute('aria-pressed', 'false');
    rerender(<PauseMenu {...base()} mode="macera" onMapTime={vi.fn()} mapTime="gece 00:00" />);
    expect(screen.queryByRole('group', { name: 'Günün saati' })).toBeNull();
    rerender(<PauseMenu {...base()} mode="insa" mapTime="gece 00:00" />);
    expect(screen.queryByRole('group', { name: 'Günün saati' })).toBeNull();
  });

  it('seçim onMapTime(ad) çağırır ve seçili durumu günceller', () => {
    const onMapTime = vi.fn();
    render(<PauseMenu {...base()} mode="insa" onMapTime={onMapTime} mapTime="gündüz 11:16" />);
    const group = screen.getByRole('group', { name: 'Günün saati' });
    fireEvent.click(within(group).getByRole('button', { name: 'Gece' }));
    expect(onMapTime).toHaveBeenCalledWith('gece');
    expect(within(group).getByRole('button', { name: 'Gece' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Gündüz' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('şafak ve bilinmeyen metin gündüz sayılır', () => {
    render(<PauseMenu {...base()} mode="insa" onMapTime={vi.fn()} mapTime="şafak 06:10" />);
    expect(within(screen.getByRole('group', { name: 'Günün saati' })).getByRole('button', { name: 'Gündüz' })).toHaveAttribute('aria-pressed', 'true');
  });
});
