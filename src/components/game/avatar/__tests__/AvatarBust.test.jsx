// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../viewerLoader', () => ({ loadAvatarViewer: vi.fn() }));

import AvatarBust from '../AvatarBust';
import AvatarCard from '../AvatarCard';
import ItemIcon from '../ItemIcon';
import { loadAvatarViewer } from '../viewerLoader';
import { buildBust } from '../../../../game/avatar/bust';
import { STYLES, defaultAvatar } from '../../../../game/avatar/catalog';

const countNodes = (nodes) => nodes.reduce((n, el) => n + 1 + (el.children ? countNodes(el.children) : 0), 0);

const MOHAWK = { ...defaultAvatar('male'), hair: { style: 'mohawk', color: 7 }, top: { style: 'ceket', color: 10 }, acc: 'gunes', trail: 'neon' };

describe('AvatarBust', () => {
    it('bust.js ağacını birebir SVG elemanlarına çevirir; etiketli portre img rolündedir', () => {
        const { container } = render(<AvatarBust config={MOHAWK} size={48} label="Ayşe'nin karakteri" />);
        const svg = screen.getByRole('img', { name: "Ayşe'nin karakteri" });
        expect(svg.tagName.toLowerCase()).toBe('svg');
        expect(svg).toHaveAttribute('viewBox', '0 0 120 120');
        expect(svg).toHaveAttribute('width', '48');
        const tree = buildBust(MOHAWK);
        expect(container.querySelectorAll('svg *').length).toBe(countNodes(tree.elements));
        // camelCase prop DOM'da doğru özniteliğe dönüşür.
        expect(container.querySelector('[stroke-width]')).not.toBeNull();
        expect(container.querySelector('[transform]')).not.toBeNull();
    });

    it('etiket yoksa süs sayılır (aria-hidden), boyut verilmezse kapsayıcıyı doldurur', () => {
        const { container } = render(<AvatarBust config={null} className="h-10 w-10" />);
        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).not.toHaveAttribute('width');
        expect(svg).toHaveClass('h-10', 'w-10');
        expect(screen.queryByRole('img')).toBeNull();
    });

    it('yapılandırma değişince yeniden çizer', () => {
        const { container, rerender } = render(<AvatarBust config={defaultAvatar('female')} />);
        const before = container.innerHTML;
        rerender(<AvatarBust config={{ ...defaultAvatar('female'), acc: 'tac' }} />);
        expect(container.innerHTML).not.toBe(before);
        rerender(<AvatarBust config={{ ...defaultAvatar('female') }} />);
        expect(container.innerHTML).toBe(before);
    });
});

describe('ItemIcon', () => {
    it('alt/ayakkabı/iz stillerinin hepsine simge çizer, bilinmeyen anahtarda boş kalır', () => {
        for (const slot of ['bottom', 'shoes', 'trail']) {
            for (const s of STYLES[slot]) {
                const { container, unmount } = render(<ItemIcon itemKey={`${slot}:${s.id}`} color="#FF6B6B" />);
                expect(container.querySelector('svg'), `${slot}:${s.id}`).not.toBeNull();
                unmount();
            }
        }
        const { container } = render(<ItemIcon itemKey="hair:yok" />);
        expect(container.innerHTML).toBe('');
    });
});

const renderCard = (props) =>
    render(
        <MemoryRouter>
            <AvatarCard {...props} />
        </MemoryRouter>
    );

describe('AvatarCard (Oyun Karakteri kartı)', () => {
    it('kayıtlı karakter + kendi profili: portre, özet, Düzenle, Oyun profili ve 3D gör', () => {
        renderCard({ avatar: MOHAWK, username: 'ayse', isOwn: true });
        const card = screen.getByTestId('game-avatar-card');
        expect(within(card).getByRole('heading', { name: 'Oyun Karakteri' })).toBeInTheDocument();
        expect(within(card).getByRole('img', { name: 'ayse adlı oyuncunun karakteri' })).toBeInTheDocument();
        expect(within(card).getByText('Mohawk')).toBeInTheDocument();
        expect(within(card).getByText('Deri Ceket')).toBeInTheDocument();
        expect(within(card).getByText('Güneş Gözlüğü')).toBeInTheDocument();
        expect(within(card).getByText('Neon Şerit')).toBeInTheDocument();
        expect(within(card).getByRole('link', { name: /Düzenle/ })).toHaveAttribute('href', '/oyun/karakter');
        expect(within(card).getByRole('link', { name: /Oyun profili/ })).toHaveAttribute('href', '/oyun/profil/ayse');
        expect(within(card).queryByRole('link', { name: /Karakterini oluştur/ })).toBeNull();
    });

    it('başkasının kayıtlı karakteri: Düzenle yok, Oyun profili var', () => {
        renderCard({ avatar: MOHAWK, username: 'mert', isOwn: false });
        const card = screen.getByTestId('game-avatar-card');
        expect(within(card).queryByRole('link', { name: /Düzenle/ })).toBeNull();
        expect(within(card).getByRole('link', { name: /Oyun profili/ })).toHaveAttribute('href', '/oyun/profil/mert');
    });

    it('kayıtlı karakter yok + kendi profili: Karakterini oluştur çağrısı', () => {
        renderCard({ avatar: null, username: 'ayse', isOwn: true, gender: 'female' });
        const card = screen.getByTestId('game-avatar-card');
        expect(within(card).getByText(/Henüz bir oyun karakterin yok/)).toBeInTheDocument();
        expect(within(card).getByRole('link', { name: /Karakterini oluştur/ })).toHaveAttribute('href', '/oyun/karakter');
        expect(within(card).queryByRole('button', { name: /3D gör/ })).toBeNull();
    });

    it('kayıtlı karakter yok + başkasının profili: kart gizli', () => {
        const { container } = renderCard({ avatar: null, username: 'mert', isOwn: false });
        expect(container.innerHTML).toBe('');
    });

    it('oyuncu profilinde (game) Oyun profili bağlantısı yok; seviye rozeti gösterilebilir', () => {
        renderCard({ avatar: MOHAWK, username: 'ayse', isOwn: true, variant: 'game', level: 7 });
        expect(screen.queryByRole('link', { name: /Oyun profili/ })).toBeNull();
        expect(screen.getByText('Seviye 7')).toBeInTheDocument();
    });

    it('3D gör penceresi açılır; WebGL yoksa 2D portreye düşer, Esc ile kapanır', () => {
        renderCard({ avatar: MOHAWK, username: 'ayse', isOwn: false });
        fireEvent.click(screen.getByRole('button', { name: /3D gör/ }));
        const dialog = screen.getByRole('dialog', { name: 'Oyun Karakteri' });
        const preview = within(dialog).getByTestId('avatar-preview');
        expect(preview).toHaveAttribute('data-mode', '2d');
        expect(within(dialog).getByRole('img', { name: 'ayse adlı oyuncunun karakteri' })).toBeInTheDocument();
        // jsdom'da WebGL2 yok: three.js parçası hiç indirilmez.
        expect(loadAvatarViewer).not.toHaveBeenCalled();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
