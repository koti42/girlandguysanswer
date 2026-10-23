// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import JournalPanel from '../JournalPanel.jsx';
import { makeFakeApi } from './panelsTestKit.js';
import { BIOME_KEYS } from '../../../../game/kesif/sim/constants.js';

const JOURNAL = {
    quests: [
        { id: 'q1', title: 'Ağaç kes', desc: 'Bir ağaçtan odun topla.', state: 'tamamlandı', progress: 3, goal: 3 },
        { id: 'q2', title: 'Kazma yap', desc: 'Tezgahta bir kazma üret.', state: 'aktif', progress: 1, goal: 4 },
        { id: 'q3', title: 'İlk tapınak', desc: 'Bir tapınak bul.', state: 'kilitli', progress: 0, goal: 1 },
    ],
    achievements: [
        { id: 'a1', title: 'İlk Adım', desc: 'Oyuna başla.', done: true, progressText: '' },
        { id: 'a2', title: 'Madenci', desc: '100 blok kır.', done: false, progressText: '37 / 100' },
    ],
    discovered: { structures: 5, biomes: 3 },
    stats: { blocksBroken: 1500, blocksPlaced: 200, mobsKilled: 9, distance: 4200, playTime: 4000, deaths: 1, parkourBest: { p1: 23450 } },
    abilities: { doubleJump: true, grapple: false, glide: false, portalGun: false },
};
const mk = () => makeFakeApi({ journal: JOURNAL });

describe('JournalPanel', () => {
    it('beş sekme; Görevler varsayılan, aktif görev önde, ilerleme çubukları', () => {
        render(<JournalPanel api={mk()} onClose={() => {}} />);
        expect(screen.getByRole('dialog', { name: 'Günlük' })).toBeInTheDocument();
        const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
        expect(tabs).toEqual(['Görevler', 'Başarımlar', 'Keşifler', 'İstatistik', 'Yetenekler']);
        expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('quest-summary')).toHaveTextContent('1 / 3 görev tamamlandı');
        const titles = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
        expect(titles).toEqual(['Kazma yap', 'İlk tapınak', 'Ağaç kes']);
        const bar = screen.getByRole('progressbar', { name: 'Kazma yap ilerlemesi' });
        expect(bar).toHaveAttribute('aria-valuenow', '25');
        expect(screen.getByTestId('quest-q2')).toHaveTextContent('1 / 4');
        expect(screen.getByTestId('quest-q2')).toHaveTextContent('Sürüyor');
        expect(screen.getByTestId('quest-q1')).toHaveTextContent('✓ Tamamlandı');
        expect(screen.getByRole('progressbar', { name: 'Ağaç kes ilerlemesi' })).toHaveAttribute('aria-valuenow', '100');
        expect(screen.getByTestId('quest-q3')).toHaveTextContent('Kilitli');
    });

    it('sekmeler tıklama ve ok tuşlarıyla değişir; içerik değişir', () => {
        render(<JournalPanel api={mk()} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Başarımlar' }));
        expect(screen.getByTestId('ach-summary')).toHaveTextContent('1 / 2 başarım kazanıldı');
        expect(screen.getByTestId('ach-a2')).toHaveTextContent('37 / 100');
        expect(screen.getByTestId('ach-a1')).toHaveTextContent('Kazanıldı');
        const tab = screen.getByRole('tab', { name: 'Başarımlar' });
        tab.focus();
        fireEvent.keyDown(tab, { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Keşifler' })).toHaveAttribute('aria-selected', 'true');
        expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Keşifler' }));
        expect(screen.getByTestId('disc-biomes')).toHaveTextContent(`3 / ${BIOME_KEYS.length}`);
        expect(screen.getByRole('progressbar', { name: 'Biyomlar keşfi' })).toHaveAttribute('aria-valuenow', String(Math.round((3 / BIOME_KEYS.length) * 100)));
        expect(screen.getByTestId('disc-structures')).toHaveTextContent('5');
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Keşifler' }), { key: 'End' });
        expect(screen.getByRole('tab', { name: 'Yetenekler' })).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(screen.getByRole('tab', { name: 'Yetenekler' }), { key: 'ArrowRight' });
        expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'journal-tab-gorev');
    });

    it('istatistikler Türkçe etiketlerle', () => {
        render(<JournalPanel api={mk()} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'İstatistik' }));
        expect(screen.getByTestId('stat-blocksBroken')).toHaveTextContent((1500).toLocaleString('tr-TR'));
        expect(screen.getByTestId('stat-distance')).toHaveTextContent('4,2 km');
        expect(screen.getByTestId('stat-playTime')).toHaveTextContent('1 sa 6 dk');
        expect(screen.getByTestId('stat-parkour:p1')).toHaveTextContent('23,45 sn');
        expect(screen.getByText('Kırılan blok')).toBeInTheDocument();
    });

    it('yetenekler: açık/kilitli ve nasıl açılır ipucu', () => {
        render(<JournalPanel api={mk()} onClose={() => {}} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Yetenekler' }));
        expect(screen.getByTestId('ability-doubleJump')).toHaveTextContent('Açıldı');
        expect(screen.getByTestId('ability-doubleJump')).toHaveTextContent('Kazanıldığı yer');
        expect(screen.getByTestId('ability-grapple')).toHaveTextContent('Kilitli');
        expect(screen.getByTestId('ability-grapple')).toHaveTextContent('Nasıl açılır');
        expect(screen.getByTestId('ability-portalGun')).toHaveTextContent('Gölge Hükümdar');
    });

    it('initialTab ile açılır; geçersiz initialTab görevlere düşer', () => {
        const { unmount } = render(<JournalPanel api={mk()} onClose={() => {}} initialTab="istatistik" />);
        expect(screen.getByRole('tab', { name: 'İstatistik' })).toHaveAttribute('aria-selected', 'true');
        unmount();
        render(<JournalPanel api={mk()} onClose={() => {}} initialTab="yok" />);
        expect(screen.getByRole('tab', { name: 'Görevler' })).toHaveAttribute('aria-selected', 'true');
    });

    it('boş günlük ve okunamayan günlük güvenli', () => {
        const api = makeFakeApi({ journal: { quests: [], achievements: [], stats: {}, abilities: {}, discovered: {} } });
        const { unmount } = render(<JournalPanel api={api} onClose={() => {}} />);
        expect(screen.getByText(/Şimdilik görev yok/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'İstatistik' }));
        expect(screen.getByText('Henüz istatistik yok.')).toBeInTheDocument();
        unmount();
        render(<JournalPanel api={makeFakeApi({ journal: null })} onClose={() => {}} />);
        expect(screen.getByText('Günlük okunamadı.')).toBeInTheDocument();
    });

    it('version artınca günlük yeniden okunur; Esc kapatır', () => {
        const onClose = vi.fn();
        const api = mk();
        const { rerender } = render(<JournalPanel api={api} onClose={onClose} version={0} />);
        const n = api.getJournal.mock.calls.length;
        api.getJournal.mockImplementation(() => ({ ...JOURNAL, quests: [{ id: 'q9', title: 'Yeni görev', state: 'aktif', progress: 0, goal: 2 }] }));
        rerender(<JournalPanel api={api} onClose={onClose} version={1} />);
        expect(api.getJournal.mock.calls.length).toBeGreaterThan(n);
        expect(within(screen.getByRole('tabpanel')).getByText('Yeni görev')).toBeInTheDocument();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
