// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, afterEach, beforeAll } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import toast from 'react-hot-toast';
import AppToaster from '../AppToaster';

beforeAll(() => {
    // jsdom'da yok; react-hot-toast hareket azaltma tercihini buradan okuyor.
    window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
});

afterEach(() => {
    act(() => toast.remove());
});

describe('AppToaster', () => {
    it('başarı, hata ve düz bildirimleri kendi tasarımıyla çizer', async () => {
        render(<AppToaster />);
        act(() => {
            toast.success('Kaydedildi');
            toast.error('Bir hata oldu');
            toast('Panoya kopyalandı', { icon: '🔗' });
        });
        expect(await screen.findByText('Kaydedildi')).toBeTruthy();
        expect(screen.getByText('Bir hata oldu')).toBeTruthy();
        expect(screen.getByText('🔗')).toBeTruthy();
        expect(screen.getAllByRole('button', { name: 'Bildirimi kapat' })).toHaveLength(3);
        // Süreli bildirimlerde kalan süre çubuğu var.
        expect(document.querySelectorAll('.app-toast-progress')).toHaveLength(3);
    });

    it('yükleniyor bildiriminde kapatma düğmesi ve süre çubuğu yok', async () => {
        render(<AppToaster />);
        act(() => {
            toast.loading('Doğrulanıyor…');
        });
        expect(await screen.findByText('Doğrulanıyor…')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Bildirimi kapat' })).toBeNull();
        expect(document.querySelector('.app-toast-progress')).toBeNull();
    });

    it('kapat düğmesi bildirimi kapatır; özel bileşenler olduğu gibi çizilir', async () => {
        render(<AppToaster />);
        act(() => {
            toast.success('Kapanacak');
            toast.custom(() => <div>Özel kart</div>);
        });
        expect(await screen.findByText('Özel kart')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Bildirimi kapat' }));
        expect(document.querySelector('.app-toast-out')).toBeTruthy();
    });
});
