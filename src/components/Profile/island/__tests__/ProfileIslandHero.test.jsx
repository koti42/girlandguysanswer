// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
 * Ada Profili kahramanı. Sahne motoru sahte (loader mock'lu): WebGL jsdom'da
 * hiç yüklenmez. Sınanan: yedekler, durak gezintisi + aria-live, kartlardaki
 * gerçek veri, gizlilik, kendi profili ile ziyaretçi farkı, söküm.
 */

const env = vi.hoisted(() => ({ webgl: true, reduced: false }));
vi.mock('../../../game/avatar/avatarUtils', async (importOriginal) => ({
    ...(await importOriginal()),
    hasWebGL2: () => env.webgl,
    prefersReducedMotion: () => env.reduced,
}));
vi.mock('../islandLoader', () => ({ loadIslandScene: vi.fn(), loadIslandHero: vi.fn() }));

import { loadIslandScene } from '../islandLoader';
import { resetIslandSupportCache } from '../islandUtils';
import ProfileIslandHero from '../ProfileIslandHero';
import IslandPreview from '../IslandPreview';
import IslandCta from '../IslandCta';

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

let engine;
const installEngine = ({ readyCall = true } = {}) => {
    engine = { opts: null, scene: null, create: null };
    engine.create = vi.fn(async (opts) => {
        engine.opts = opts;
        engine.scene = {
            goTo: vi.fn((i) => opts.onStopChange(i)),
            next: vi.fn(),
            prev: vi.fn(),
            getStop: vi.fn(() => 0),
            resize: vi.fn(),
            setPaused: vi.fn(),
            destroy: vi.fn(),
        };
        if (readyCall) opts.onReady();
        return engine.scene;
    });
    loadIslandScene.mockResolvedValue({ createIslandScene: engine.create });
};

const PROFILE = {
    id: 'u1',
    username: 'mert',
    name: 'mert',
    gender: 'male',
    bio: 'Merhaba, ben Mert.',
    joinedDate: 'Mart 2025',
    location: 'İzmir',
    level: { name: 'Usta Üye', color: '#8b5cf6' },
    ranks: { general: 7, gender: 3 },
    badges: [
        { id: 1, name: 'İlk Adım', icon_url: 'https://cdn.test/a.png' },
        { id: 2, name: 'Gece Kuşu' },
    ],
    stats: { questions: 12, answers: 34, opinions: 5, followers: 1200, following: 80, likes: 9 },
    isPrivate: false,
    isFollowing: false,
    allow_messaging: true,
    messaging_mode: 'everyone',
    profile_theme: { key: 'ada', active: true, expires_at: null },
};
const QUESTIONS = [
    { id: 1, slug: 'en-iyi-kahve', title: 'En iyi kahve hangisi?' },
    { id: 2, title: 'Hafta sonu ne yapılır?' },
];

const renderHero = (props = {}) =>
    render(
        <MemoryRouter>
            <ProfileIslandHero profile={PROFILE} questions={QUESTIONS} {...props} />
        </MemoryRouter>
    );

const goNext = (times = 1) => {
    for (let i = 0; i < times; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Sonraki durak' }));
};

beforeEach(() => {
    vi.clearAllMocks();
    env.webgl = true;
    env.reduced = false;
    resetIslandSupportCache();
    document.documentElement.removeAttribute('data-a11y');
    window.scrollBy = vi.fn();
    installEngine();
});

afterEach(() => {
    document.documentElement.removeAttribute('data-a11y');
});

describe('ProfileIslandHero — yükleme ve sahne', () => {
    it('önce afiş + yükleme parıltısı, motor gelince sahne hazır; sözleşme argümanları verilir', async () => {
        let release;
        loadIslandScene.mockReturnValue(new Promise((res) => { release = res; }));
        renderHero();
        const hero = screen.getByTestId('island-hero');
        expect(hero).toHaveAttribute('data-phase', 'loading');
        expect(hero.style.height).toBe('clamp(360px, 70vh, 640px)');
        expect(screen.getByTestId('island-poster')).toHaveAttribute('data-hidden', 'false');
        expect(screen.getByTestId('island-loading')).toBeInTheDocument();

        await act(async () => { release({ createIslandScene: engine.create }); });
        await waitFor(() => expect(hero).toHaveAttribute('data-phase', 'ready'));
        expect(screen.queryByTestId('island-loading')).toBeNull();
        expect(screen.getByTestId('island-poster')).toHaveAttribute('data-hidden', 'true');

        const o = engine.opts;
        expect(o.container).toBe(screen.getByTestId('island-stage'));
        expect(o.stops.map((s) => s.key)).toEqual(['hakkinda', 'sorular', 'cevaplar', 'rozetler', 'takip']);
        expect(o.gender).toBe('male');
        expect(o.reducedMotion).toBe(false);
        expect(o.avatarConfig).toMatchObject({ v: 1, body: 'erkek' });
        expect(o.profile).toEqual({ username: 'mert', name: 'mert', gender: 'male', level: 'Usta Üye' });
        expect(typeof o.onStopChange).toBe('function');
        expect(typeof o.onError).toBe('function');
    });

    it('sahne odaklanabilir ve ok tuşu yönergesi taşır', async () => {
        renderHero();
        await flush();
        const stage = screen.getByTestId('island-stage');
        expect(stage).toHaveAttribute('tabindex', '0');
        expect(stage.getAttribute('aria-label')).toMatch(/ok tuşlarıyla/);
    });

    it('sökülünce sahne yok edilir; kurulum bitmeden sökülürse biten sahne hemen yok edilir', async () => {
        const { unmount } = renderHero();
        await flush();
        const scene = engine.scene;
        unmount();
        expect(scene.destroy).toHaveBeenCalledTimes(1);

        let release;
        loadIslandScene.mockReturnValue(new Promise((res) => { release = res; }));
        const second = renderHero();
        second.unmount();
        await act(async () => { release({ createIslandScene: engine.create }); });
        expect(engine.create).toHaveBeenCalledTimes(1); // yalnız ilk sahne kuruldu
    });
});

describe('ProfileIslandHero — yedekler', () => {
    const FALLBACK = <div data-testid="cover-fallback">Standart kapak</div>;

    it('WebGL yok: motor hiç yüklenmez, standart kapak çizilir', () => {
        env.webgl = false;
        renderHero({ fallback: FALLBACK });
        expect(screen.getByTestId('cover-fallback')).toBeInTheDocument();
        expect(screen.queryByTestId('island-hero')).toBeNull();
        expect(loadIslandScene).not.toHaveBeenCalled();
    });

    it('erişilebilirlik modu: standart kapak, motor yok', () => {
        document.documentElement.setAttribute('data-a11y', '1');
        renderHero({ fallback: FALLBACK });
        expect(screen.getByTestId('cover-fallback')).toBeInTheDocument();
        expect(loadIslandScene).not.toHaveBeenCalled();
    });

    it('hareket azaltma: standart kapak, motor yok', () => {
        env.reduced = true;
        renderHero({ fallback: FALLBACK });
        expect(screen.getByTestId('cover-fallback')).toBeInTheDocument();
        expect(loadIslandScene).not.toHaveBeenCalled();
    });

    it('motor parçası yüklenemezse standart kapağa düşer', async () => {
        loadIslandScene.mockRejectedValue(new Error('chunk yok'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderHero({ fallback: FALLBACK });
        expect(await screen.findByTestId('cover-fallback')).toBeInTheDocument();
        expect(screen.queryByTestId('island-hero')).toBeNull();
        warn.mockRestore();
    });

    it('WebGL bağlamı kaybolursa (onError) kapağa düşer ve sahne yok edilir', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderHero({ fallback: FALLBACK });
        await flush();
        await waitFor(() => expect(screen.getByTestId('island-hero')).toHaveAttribute('data-phase', 'ready'));
        const scene = engine.scene;
        act(() => engine.opts.onError(new Error('webglcontextlost')));
        expect(await screen.findByTestId('cover-fallback')).toBeInTheDocument();
        expect(scene.destroy).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('onReady(false) kapağa düşürür', async () => {
        engine.create.mockImplementation(async (opts) => {
            engine.opts = opts;
            opts.onReady(false);
            return { goTo: vi.fn(), destroy: vi.fn() };
        });
        renderHero({ fallback: FALLBACK });
        expect(await screen.findByTestId('cover-fallback')).toBeInTheDocument();
    });

    it('yedek verilmediyse afiş + kartlar kalır (sekmeler sayfada zaten altta)', async () => {
        loadIslandScene.mockRejectedValue(new Error('x'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        renderHero();
        await waitFor(() => expect(screen.getByTestId('island-hero')).toHaveAttribute('data-phase', 'poster'));
        expect(screen.queryByTestId('island-stage')).toBeNull();
        expect(screen.getByRole('heading', { name: 'mert' })).toBeInTheDocument();
        goNext();
        expect(screen.getByRole('heading', { name: 'Son sorular' })).toBeInTheDocument();
        warn.mockRestore();
    });
});

describe('ProfileIslandHero — durak gezintisi', () => {
    it('sonraki/önceki/nokta düğmeleri sahneyi yönlendirir ve kartı değiştirir', async () => {
        renderHero();
        await flush();
        expect(screen.getByRole('heading', { name: 'mert' })).toBeInTheDocument();

        goNext();
        expect(engine.scene.goTo).toHaveBeenLastCalledWith(1);
        expect(screen.getByRole('heading', { name: 'Son sorular' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Rozetler durağına git' }));
        expect(engine.scene.goTo).toHaveBeenLastCalledWith(3);
        expect(screen.getByRole('heading', { name: 'Rozetler' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Önceki durak' }));
        expect(engine.scene.goTo).toHaveBeenLastCalledWith(2);
        expect(screen.getByRole('heading', { name: 'Cevaplar' })).toBeInTheDocument();
    });

    it('baştan geri ve sondan ileri sarar', async () => {
        renderHero();
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Önceki durak' }));
        expect(engine.scene.goTo).toHaveBeenLastCalledWith(4);
        expect(screen.getByRole('heading', { name: 'Takip' })).toBeInTheDocument();
        goNext();
        expect(engine.scene.goTo).toHaveBeenLastCalledWith(0);
    });

    it('sürükleme/kaydırmayla motorun bildirdiği durak karta yansır', async () => {
        renderHero();
        await flush();
        act(() => engine.opts.onStopChange(3));
        expect(screen.getByRole('heading', { name: 'Rozetler' })).toBeInTheDocument();
        const dot = screen.getByRole('button', { name: 'Rozetler durağına git' });
        expect(dot).toHaveAttribute('aria-current', 'step');
        expect(screen.getByRole('button', { name: 'Hakkında durağına git' })).not.toHaveAttribute('aria-current');
    });

    it('durak değişimi aria-live (polite) bölgesinde duyurulur; ilk açılışta duyuru yok', async () => {
        renderHero();
        await flush();
        const live = screen.getByTestId('island-live');
        expect(live).toHaveAttribute('aria-live', 'polite');
        expect(live).toHaveTextContent('');
        goNext(2);
        await waitFor(() => expect(live).toHaveTextContent('Durak 3 / 5: Cevaplar'));
    });

    it('kartı gizle/göster düğmesi aria-expanded ile çalışır', async () => {
        renderHero();
        await flush();
        const toggle = screen.getByRole('button', { name: 'Bilgi kartını gizle' });
        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(toggle);
        expect(screen.queryByRole('article')).toBeNull();
        expect(screen.getByRole('button', { name: 'Bilgi kartını göster' })).toHaveAttribute('aria-expanded', 'false');
    });

    it('bütün gezinti düğmelerinin erişilebilir adı var', async () => {
        renderHero();
        await flush();
        const nav = screen.getByRole('navigation', { name: 'Ada durakları' });
        for (const b of within(nav).getAllByRole('button')) {
            expect(b).toHaveAccessibleName();
        }
        expect(within(nav).getAllByRole('button')).toHaveLength(8);
    });
});

describe('ProfileIslandHero — kartlarda gerçek veri', () => {
    it('Hakkında: ad, @kullanıcı, biyografi, seviye/sıra, katılma tarihi', async () => {
        renderHero();
        await flush();
        const card = screen.getByRole('article');
        expect(within(card).getByRole('heading', { name: 'mert' })).toBeInTheDocument();
        expect(within(card).getByText('@mert')).toBeInTheDocument();
        expect(within(card).getByText('Merhaba, ben Mert.')).toBeInTheDocument();
        expect(within(card).getByText('Usta Üye')).toBeInTheDocument();
        expect(within(card).getByText('Genel #7')).toBeInTheDocument();
        expect(within(card).getByText('Katıldı Mart 2025')).toBeInTheDocument();
        expect(within(card).getByText('İzmir')).toBeInTheDocument();
    });

    it('Sorular: sayı + son soru başlıkları soru sayfalarına bağlanır; Tümünü gör sekmeyi açar', async () => {
        const onSelectTab = vi.fn();
        const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 500, top: 0, height: 500 });
        renderHero({ onSelectTab });
        await flush();
        goNext();
        const card = screen.getByRole('article');
        expect(within(card).getByText('12')).toBeInTheDocument();
        expect(within(card).getByRole('link', { name: 'En iyi kahve hangisi?' })).toHaveAttribute('href', '/question/en-iyi-kahve');
        expect(within(card).getByRole('link', { name: 'Hafta sonu ne yapılır?' })).toHaveAttribute('href', '/question/2');
        fireEvent.click(within(card).getByRole('button', { name: 'Tümünü gör' }));
        expect(onSelectTab).toHaveBeenCalledWith('questions');
        expect(window.scrollBy).toHaveBeenCalledWith({ top: 428, behavior: 'smooth' });
        rect.mockRestore();
    });

    it('Sorular listesi yoksa profil verisindeki questions kullanılır; boşsa açıklama', async () => {
        renderHero({ questions: null, profile: { ...PROFILE, questions: [{ id: 5, slug: 'x', title: 'Profilden soru' }] } });
        await flush();
        goNext();
        expect(screen.getByRole('link', { name: 'Profilden soru' })).toBeInTheDocument();
    });

    it('Sorular boş: "Henüz hiç soru sormamış."', async () => {
        renderHero({ questions: [] });
        await flush();
        goNext();
        expect(screen.getByText('Henüz hiç soru sormamış.')).toBeInTheDocument();
    });

    it('Cevaplar: cevap ve bence sayıları, ilgili sekmelere eylem', async () => {
        const onSelectTab = vi.fn();
        renderHero({ onSelectTab });
        await flush();
        goNext(2);
        const card = screen.getByRole('article');
        expect(within(card).getByText('34')).toBeInTheDocument();
        expect(within(card).getByText('5')).toBeInTheDocument();
        fireEvent.click(within(card).getByRole('button', { name: 'Cevapları gör' }));
        expect(onSelectTab).toHaveBeenLastCalledWith('answers');
        fireEvent.click(within(card).getByRole('button', { name: 'Benceleri gör' }));
        expect(onSelectTab).toHaveBeenLastCalledWith('opinions');
    });

    it('Rozetler: ad ve simge; rozet sekmesine eylem', async () => {
        const onSelectTab = vi.fn();
        const { container } = renderHero({ onSelectTab });
        await flush();
        goNext(3);
        const card = screen.getByRole('article');
        expect(within(card).getByText('İlk Adım')).toBeInTheDocument();
        expect(within(card).getByText('Gece Kuşu')).toBeInTheDocument();
        expect(container.querySelector('img[src="https://cdn.test/a.png"]')).not.toBeNull();
        fireEvent.click(within(card).getByRole('button', { name: 'Tümünü gör' }));
        expect(onSelectTab).toHaveBeenCalledWith('badges');
    });

    it('Takip: sayılar takipçi/takip sayfalarına bağlanır', async () => {
        renderHero();
        await flush();
        goNext(4);
        const card = screen.getByRole('article');
        expect(within(card).getByRole('link', { name: /Takipçi/ })).toHaveAttribute('href', '/profile/mert/followers');
        expect(within(card).getByRole('link', { name: /Takip$/ })).toHaveAttribute('href', '/profile/mert/following');
        expect(within(card).getByText('1.200')).toBeInTheDocument();
    });

    it('takip düğmesi sayfanın işleyicisini çağırır; Mesaj bağlantısı kurala göre', async () => {
        const onFollowToggle = vi.fn();
        renderHero({ tabsActions: { onFollowToggle } });
        await flush();
        fireEvent.click(screen.getByRole('button', { name: 'Takip Et' }));
        expect(onFollowToggle).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('link', { name: /Mesaj/ })).toHaveAttribute('href', '/messages/mert');
    });

    it('mesajları kapalı kişide Mesaj bağlantısı yok; yönetici için var', async () => {
        const closed = { ...PROFILE, allow_messaging: false };
        const { unmount } = renderHero({ profile: closed, tabsActions: { onFollowToggle: vi.fn() } });
        await flush();
        expect(screen.queryByRole('link', { name: /Mesaj/ })).toBeNull();
        unmount();
        renderHero({ profile: closed, tabsActions: { onFollowToggle: vi.fn(), isAdmin: true } });
        await flush();
        expect(screen.getByRole('link', { name: /Mesaj/ })).toBeInTheDocument();
    });
});

describe('ProfileIslandHero — gizlilik', () => {
    const PRIVATE = { ...PROFILE, isPrivate: true, isFollowing: false };

    it('gizli hesap, takip etmeyen ziyaretçi: soru başlığı, sayı ve rozet sızmaz', async () => {
        renderHero({ profile: PRIVATE, tabsActions: { onFollowToggle: vi.fn() } });
        await flush();
        // Hakkında (sayfadaki başlıkla aynı bilgi) görünür ve takip eylemi vardır.
        expect(screen.getByText('Merhaba, ben Mert.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Takip İsteği Gönder' })).toBeInTheDocument();

        for (let i = 1; i <= 4; i += 1) {
            goNext();
            const card = screen.getByRole('article');
            expect(within(card).getByTestId('island-locked')).toBeInTheDocument();
        }
        expect(screen.queryByText('En iyi kahve hangisi?')).toBeNull();
        expect(screen.queryByText('Gece Kuşu')).toBeNull();
        expect(screen.queryByText('1.200')).toBeNull();
        expect(screen.queryByText('34')).toBeNull();
    });

    it('gizli hesabı takip eden ziyaretçi içeriği görür', async () => {
        renderHero({ profile: { ...PRIVATE, isFollowing: true } });
        await flush();
        goNext();
        expect(screen.getByText('En iyi kahve hangisi?')).toBeInTheDocument();
        expect(screen.queryByTestId('island-locked')).toBeNull();
    });

    it('gizli hesabın sahibi kendi profilinde içeriği görür', async () => {
        renderHero({ profile: PRIVATE, isOwnProfile: true });
        await flush();
        goNext();
        expect(screen.getByText('En iyi kahve hangisi?')).toBeInTheDocument();
    });
});

describe('ProfileIslandHero — kendi profili / ziyaretçi', () => {
    it('sahip: "Ada temasını yönet" bağlantısı + Süresiz rozeti; takip/mesaj eylemi yok', async () => {
        renderHero({ isOwnProfile: true, tabsActions: { onFollowToggle: vi.fn() } });
        await flush();
        expect(screen.getByRole('link', { name: /Ada temasını yönet/ })).toHaveAttribute('href', '/settings#profil-temasi');
        expect(screen.getByTestId('island-expiry')).toHaveTextContent('Süresiz');
        expect(screen.queryByRole('button', { name: 'Takip Et' })).toBeNull();
        expect(screen.queryByRole('link', { name: /Mesaj/ })).toBeNull();
    });

    it('sahip, süreli tema: kalan gün rozeti', async () => {
        const at = new Date(Date.now() + 9 * 86400000 + 3600000).toISOString();
        renderHero({ isOwnProfile: true, profile: { ...PROFILE, profile_theme: { key: 'ada', active: true, expires_at: at } } });
        await flush();
        expect(screen.getByTestId('island-expiry')).toHaveTextContent('10 gün kaldı');
    });

    it('ziyaretçi yükü expires_at içermez ({ key, active }): rozet yok, sahne yine çizilir', async () => {
        renderHero({ profile: { ...PROFILE, profile_theme: { key: 'ada', active: true } } });
        await flush();
        expect(screen.queryByTestId('island-expiry')).toBeNull();
        expect(screen.queryByText('Süresiz')).toBeNull();
    });

    it('sahip, süresiz tema (expires_at: null): Süresiz rozeti', async () => {
        renderHero({ isOwnProfile: true, profile: { ...PROFILE, profile_theme: { key: 'ada', active: true, expires_at: null } } });
        await flush();
        expect(screen.getByTestId('island-expiry')).toHaveTextContent('Süresiz');
    });

    it('ziyaretçi: yönet bağlantısı ve süre rozeti hiç görünmez (fiyat/süre sızmaz)', async () => {
        const at = new Date(Date.now() + 5 * 86400000).toISOString();
        renderHero({ profile: { ...PROFILE, profile_theme: { key: 'ada', active: true, expires_at: at } } });
        await flush();
        expect(screen.queryByRole('link', { name: /Ada temasını yönet/ })).toBeNull();
        expect(screen.queryByTestId('island-expiry')).toBeNull();
    });
});

describe('IslandCta', () => {
    it('Profilini adaya taşı -> /settings#profil-temasi, 44px hedef sınıfıyla', () => {
        render(
            <MemoryRouter>
                <IslandCta />
            </MemoryRouter>
        );
        const link = screen.getByRole('link', { name: 'Profilini adaya taşı' });
        expect(link).toHaveAttribute('href', '/settings#profil-temasi');
        expect(link.className).toMatch(/min-h-\[44px\]/);
    });
});

describe('IslandPreview', () => {
    it('hazır olunca sahne kapta, sürükleme ipucu görünür; sökülünce yok edilir', async () => {
        const { unmount } = render(<IslandPreview avatar={null} gender="female" className="h-48" />);
        const box = screen.getByTestId('island-preview');
        expect(box).toHaveClass('h-48');
        await flush();
        await waitFor(() => expect(box).toHaveAttribute('data-phase', 'ready'));
        expect(engine.opts.gender).toBe('female');
        expect(engine.opts.avatarConfig).toMatchObject({ body: 'kiz' });
        expect(screen.getByRole('img', { name: /canlı önizlemesi/ })).toBeInTheDocument();
        expect(screen.getByText(/Döndürmek için sürükle/)).toBeInTheDocument();
        const scene = engine.scene;
        unmount();
        expect(scene.destroy).toHaveBeenCalled();
    });

    it('WebGL yoksa afiş + açıklama (boş kutu yok), motor yüklenmez', () => {
        env.webgl = false;
        render(<IslandPreview gender="male" />);
        expect(screen.getByTestId('island-poster')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Canlı önizleme bu cihazda kullanılamıyor.');
        expect(loadIslandScene).not.toHaveBeenCalled();
    });

    it('erişilebilirlik modunda motor yüklenmez', () => {
        document.documentElement.setAttribute('data-a11y', '1');
        render(<IslandPreview gender="male" />);
        expect(loadIslandScene).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('motor yüklenemezse afiş + açıklama', async () => {
        loadIslandScene.mockRejectedValue(new Error('yok'));
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(<IslandPreview gender="male" />);
        expect(await screen.findByText('Canlı önizleme bu cihazda kullanılamıyor.')).toBeInTheDocument();
        warn.mockRestore();
    });

    it('hareket azaltmada sahne yine kurulur ama motora reducedMotion bildirilir', async () => {
        env.reduced = true;
        render(<IslandPreview gender="male" />);
        await flush();
        expect(engine.opts.reducedMotion).toBe(true);
    });
});
