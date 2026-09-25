import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    FaBars, FaBell, FaBullhorn, FaChevronLeft, FaClipboardList, FaCog, FaExclamationTriangle, FaFingerprint,
    FaFlag, FaGamepad, FaHome, FaLayerGroup, FaSearch, FaServer, FaShieldAlt, FaSignOutAlt, FaTags, FaUsers, FaUserShield, FaComments,
} from 'react-icons/fa';
import { usePanelAuth } from '../panel/auth/PanelAuthContext';
import { useQuery } from '../panel/hooks/useQuery';
import { useHotkeys } from '../panel/hooks/useHotkeys';
import { adminApi } from '../panel/api/endpoints';
import { MOD_DATA_CHANGED, on } from '../panel/lib/events';
import { Avatar, CommandPalette, Kbd } from '../panel/ui';
import ThemeToggle from '../panel/ui/ThemeToggle';
import { usePanelTheme } from '../panel/hooks/usePanelTheme';
import '../panel/theme.css';

const NAV = [
    { group: 'Genel', items: [
        { to: '/cpl-manage', label: 'Panel', icon: FaHome, end: true },
    ] },
    { group: 'Topluluk', items: [
        { to: '/cpl-manage/users', label: 'Kullanıcılar', icon: FaUsers },
        { to: '/cpl-manage/content', label: 'İçerik', icon: FaLayerGroup },
        { to: '/cpl-manage/complaints', label: 'Şikâyetler', icon: FaExclamationTriangle, badge: 'pending' },
        { to: '/cpl-manage/communities', label: 'Topluluk odaları', icon: FaComments },
    ] },
    { group: 'Yapılandırma', items: [
        { to: '/cpl-manage/catalog', label: 'Kataloglar', icon: FaTags },
        { to: '/cpl-manage/gamification', label: 'Oyunlaştırma', icon: FaGamepad },
        { to: '/cpl-manage/roles', label: 'Roller', icon: FaUserShield },
        { to: '/cpl-manage/special-days', label: 'Özel günler', icon: FaFlag },
        { to: '/cpl-manage/settings', label: 'Ayarlar', icon: FaCog },
    ] },
    { group: 'Operasyon', items: [
        { to: '/cpl-manage/broadcast', label: 'Duyuru', icon: FaBullhorn },
        { to: '/cpl-manage/audit', label: 'Denetim kaydı', icon: FaClipboardList },
        { to: '/cpl-manage/system', label: 'Sistem', icon: FaServer, superOnly: true },
    ] },
];

/**
 * Admin paneli kabuğu: daraltılabilir kenar çubuğu, üst çubuk, komut paleti.
 * Bekleyen şikâyet sayısı üst çubukta ve menüde rozet olarak durur ve
 * 60 saniyede bir tazelenir.
 */
export default function AdminShell() {
    const { user, logout, isSuperAdmin } = usePanelAuth();
    const { resolved: theme } = usePanelTheme();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('admin_sidebar') === '1'; } catch { return false; } });
    const [mobileOpen, setMobileOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    const overview = useQuery(() => adminApi.overview(), []);
    useEffect(() => {
        const t = window.setInterval(() => overview.refetch(), 60000);
        const off = on(MOD_DATA_CHANGED, () => overview.refetch());
        return () => { window.clearInterval(t); off(); };
    }, [overview]);
    const pending = overview.data?.moderation?.complaints_pending ?? 0;

    useEffect(() => { setMobileOpen(false); }, [location.pathname]);
    useEffect(() => { try { localStorage.setItem('admin_sidebar', collapsed ? '1' : '0'); } catch { /* yoksay */ } }, [collapsed]);

    useHotkeys({ 'mod+k': () => setPaletteOpen(true), 'g d': () => navigate('/cpl-manage') }, [navigate]);

    const commands = useMemo(() => [
        ...NAV.flatMap((g) => g.items.filter((i) => !i.superOnly || isSuperAdmin).map((i) => ({ id: i.to, label: i.label, to: i.to, group: g.group, icon: i.icon }))),
        { id: 'mod', label: 'Moderasyon paneline geç', to: '/mod', group: 'Panel', icon: FaShieldAlt },
        { id: 'users-search', label: 'Kullanıcı ara…', to: '/cpl-manage/users?focus=1', group: 'Hızlı', icon: FaSearch },
        { id: 'security', label: 'Güvenlik / passkey', to: '/cpl-manage/security', group: 'Hesap', icon: FaFingerprint },
        { id: 'logout', label: 'Çıkış yap', run: () => logout().then(() => navigate('/cpl-manage/login')), group: 'Hesap', icon: FaSignOutAlt },
    ], [isSuperAdmin, logout, navigate]);

    const sidebar = (
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
            {NAV.map((g) => (
                <div key={g.group}>
                    {!collapsed && <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-wider p-muted">{g.group}</div>}
                    <ul className="space-y-0.5">
                        {g.items.filter((i) => !i.superOnly || isSuperAdmin).map((i) => (
                            <li key={i.to}>
                                <NavLink to={i.to} end={i.end} title={collapsed ? i.label : undefined} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 h-10 text-sm transition-colors p-ring ${isActive ? 'p-accent-bg font-semibold shadow-sm' : 'p-muted hover:text-[var(--p-text)] p-hover'} ${collapsed ? 'justify-center' : ''}`}>
                                    <i.icon className="text-[15px] shrink-0" aria-hidden />
                                    {!collapsed && <span className="flex-1 truncate">{i.label}</span>}
                                    {!collapsed && i.badge === 'pending' && pending > 0 && <span className="text-[10px] font-bold rounded-full bg-rose-500 text-white px-1.5 py-0.5">{pending}</span>}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </nav>
    );

    return (
        <div data-panel="admin" data-theme={theme} className="min-h-screen flex">
            {mobileOpen && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setMobileOpen(false)} />}

            <aside className={`fixed lg:sticky top-0 z-50 h-screen flex flex-col p-surface border-r transition-[width,transform] duration-200 ${collapsed ? 'w-[72px]' : 'w-64'} ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
                <div className={`h-16 flex items-center gap-3 px-4 border-b border-[var(--p-border)] ${collapsed ? 'justify-center' : ''}`}>
                    <div className="h-9 w-9 rounded-xl p-accent-bg grid place-items-center shrink-0"><FaUserShield /></div>
                    {!collapsed && <div className="min-w-0"><div className="text-sm font-bold leading-tight">Yönetim</div><div className="text-[11px] p-muted truncate">Herkesler Soruyor</div></div>}
                </div>
                {sidebar}
                <div className="p-3 border-t border-[var(--p-border)]">
                    <button type="button" onClick={() => setCollapsed((c) => !c)} className="hidden lg:flex w-full items-center justify-center gap-2 h-9 rounded-lg text-xs p-muted hover:text-[var(--p-text)] p-hover p-ring" aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}>
                        <FaChevronLeft className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />{!collapsed && 'Daralt'}
                    </button>
                </div>
            </aside>

            <div className="flex-1 min-w-0 flex flex-col">
                <header className="sticky top-0 z-30 h-16 p-surface border-b flex items-center gap-3 px-4 lg:px-6">
                    <button type="button" onClick={() => setMobileOpen(true)} className="lg:hidden h-10 w-10 rounded-xl grid place-items-center p-hover p-ring" aria-label="Menü"><FaBars /></button>
                    <button type="button" onClick={() => setPaletteOpen(true)} className="flex-1 max-w-md h-10 rounded-xl p-inset border border-[var(--p-border)] px-3 flex items-center gap-2 text-sm p-muted hover:text-[var(--p-text)] p-ring">
                        <FaSearch className="text-xs" /><span className="flex-1 text-left">Ara veya komut çalıştır</span><Kbd>⌘K</Kbd>
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                        <NavLink to="/cpl-manage/complaints" className="relative h-10 w-10 rounded-xl grid place-items-center p-hover p-ring" aria-label={`${pending} bekleyen şikâyet`} title="Bekleyen şikâyetler">
                            <FaBell />
                            {pending > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center px-1">{pending > 99 ? '99+' : pending}</span>}
                        </NavLink>
                        <ThemeToggle />
                        <NavLink to="/mod" className="hidden sm:inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm border border-amber-500/30 p-tone-warning hover:bg-amber-500/10 p-ring" title="Moderasyon paneli"><FaShieldAlt className="text-xs" />Moderasyon</NavLink>
                        <div className="flex items-center gap-2 pl-2 border-l border-[var(--p-border)]">
                            <Avatar user={user} size={32} />
                            <div className="hidden md:block leading-tight"><div className="text-sm font-semibold">{user?.username}</div><div className="text-[11px] p-muted">{isSuperAdmin ? 'Süper admin' : 'Admin'}</div></div>
                            <NavLink to="/cpl-manage/security" className="h-10 w-10 rounded-xl grid place-items-center p-muted hover:text-[var(--p-text)] p-hover p-ring" aria-label="Güvenlik" title="Güvenlik / passkey"><FaFingerprint /></NavLink>
                            <button type="button" onClick={() => logout().then(() => navigate('/cpl-manage/login'))} className="h-10 w-10 rounded-xl grid place-items-center p-muted hover:p-tone-danger hover:bg-rose-500/10 p-ring" aria-label="Çıkış yap" title="Çıkış"><FaSignOutAlt /></button>
                        </div>
                    </div>
                </header>
                <main className="flex-1 p-4 lg:p-8 max-w-[1500px] w-full mx-auto"><Outlet context={{ overview }} /></main>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} panel="admin" />
        </div>
    );
}
