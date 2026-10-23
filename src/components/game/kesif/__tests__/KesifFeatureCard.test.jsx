// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import KesifFeatureCard from '../KesifFeatureCard';
import HowTo from '../HowTo';

describe('KesifFeatureCard', () => {
    it('lobiye bağlanır; misafirde "Keşfetmeye başla", üyede "Dünyaya dal"', () => {
        const { rerender } = render(
            <MemoryRouter>
                <KesifFeatureCard guest />
            </MemoryRouter>
        );
        const link = screen.getByRole('link', { name: /Herkesler Keşfediyor/ });
        expect(link).toHaveAttribute('href', '/oyun/kesif');
        expect(link).toHaveAccessibleName(/Keşfetmeye başla/);
        expect(within(link).getByText('Keşfetmeye başla')).toBeInTheDocument();
        expect(link).toHaveClass('game-hero-kesif');

        rerender(
            <MemoryRouter>
                <KesifFeatureCard />
            </MemoryRouter>
        );
        expect(screen.getByRole('link', { name: /Dünyaya dal/ })).toBeInTheDocument();
    });

    it('süs görseli ekran okuyucudan gizli; dışarıdan sınıf alır', () => {
        const { container } = render(
            <MemoryRouter>
                <KesifFeatureCard className="lg:col-span-2" />
            </MemoryRouter>
        );
        expect(container.querySelector('.kesif-art')).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByRole('link')).toHaveClass('lg:col-span-2');
        // Görselde yazı/odaklanabilir öğe yok
        expect(container.querySelector('.kesif-art a, .kesif-art button')).toBeNull();
    });
});

describe('HowTo', () => {
    it('başlık, masaüstü ve dokunmatik kontroller, güvenlik notu', () => {
        render(<HowTo />);
        expect(screen.getByRole('heading', { level: 2, name: 'Nasıl oynanır?' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'Bilgisayar' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'Telefon ve tablet' })).toBeInTheDocument();
        expect(screen.getByText('Sağ tık')).toBeInTheDocument();
        expect(screen.getByText(/Sol yarıda parmağını kaydır/)).toBeInTheDocument();
        expect(screen.getByText(/kan yok/)).toBeInTheDocument();
    });
});
