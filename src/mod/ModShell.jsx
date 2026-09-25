import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FaBars, FaClipboardList, FaFingerprint, FaHome, FaLayerGroup, FaSearch, FaShieldAlt, FaSignOutAlt, FaUserShield, FaUsers, FaBolt } from 'react-icons/fa';
import { usePanelAuth } from '../panel/auth/PanelAuthContext';
import { useQuery } from '../panel/hooks/useQuery';
import { useHotkeys } from '../panel/hooks/useHotkeys';
import { modApi } from '../panel/api/endpoints';
import { MOD_DATA_CHANGED, on } from '../panel/lib/events';
import { Avatar, CommandPalette, Kbd } from '../panel/ui';
import '../panel/theme.css';

const NAV = [
    { to: '/mod', label: 'Özet', icon: FaHome, end: true, key: '1' },
    { to: '/mod/queue', label: 'Kuyruk', icon: FaBolt, badge: true, key: '2' },
    { to: '/mod/content', label: 'İçerik', icon: FaLayerGroup, key: '3' },
    { to: '/mod/users', label: 'Kullanıcılar', icon: FaUsers, key: '4' },
    { to: '/mod/activity', label: 'Aktivite', icon: FaClipboardList, key: '5' },
];

/**
 * Moderasyon paneli kabuğu. Admin'den bilinçli olarak farklı: kenar çubuğu
 * yok, üstte yatay menü; amber kimlik; her yerde klavye kısayolu.
 * Bekleyen şikâyet sayısı 30 saniyede bir tazelenir.
 */
export default function ModShell() {
    const { user, logout, isAdmin } = usePanelAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);

    const dash = useQuery(() => modApi.dashboard(), []);
    useEffect(() => { const t = window.setInterval(() => dash.refetch(), 30000); const off = on(MOD_DATA_CHANGED, () => dash.refetch()); return () => { window.clearInterval(t); off(); }; }, [dash]);
    const pending = dash.data?.queue?.pending ?? 0;
    useEffect(() => { setMenuOpen(false); }, [location.pathname]);

    useHotkeys({
        'mod+k': () => setPaletteOpen(true),
        ...Object.fromEntries(NAV.map((n) => [n.key, () => navigate(n.to)])),
    }, [navigate]);

    const commands = useMemo(() => [
        ...NAV.map((n) => ({ id: n.to, label: n.label, to: n.to, hint: n.key, icon: n.icon, group: 'Sayfa' })),
        { id: 'search-user', label: 'Kullanıcı ara…', to: '/mod/users?focus=1', icon: FaSearch, group: 'Hızlı' },
        ...(isAdmin ? [{ id: 'admin', label: 'Yönetim paneline geç', to: '/cpl-manage', icon: FaUserShield, group: 'Panel' }] : []),
        { id: 'security', label: 'Güvenlik / passkey', to: '/mod/security', icon: FaFingerprint, group: 'Hesap' },
        { id: 'logout', label: 'Çıkış yap', run: () => logout().then(() => navigate('/mod/login')), icon: FaSignOutAlt, group: 'Hesap' },
    ], [isAdmin, logout, navigate]);

    return (
        <div data-panel="mod" className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-40 p-surface border-b">
                <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-3">
                    <NavLink to="/mod" className="flex items-center gap-2 shrink-0">
                        <span className="h-8 w-8 rounded-lg p-accent-bg grid place-items-center"><FaShieldAlt className="text-sm" /></span>
                        <span className="hidden sm:block text-sm font-bold">Moderasyon</span>
                    </NavLink>
                    <nav className="hidden md:flex items-center gap-1 ml-4">
                        {NAV.map((n) => (
                            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm transition-colors p-ring ${isActive ? 'bg-white/[0.1] font-semibold' : 'p-muted hover:text-[var(--p-text)] hover:bg-white/[0.06]'}`}>
                                <n.icon className="text-xs" />{n.label}
                                {n.badge && pending > 0 && <span className="text-[10px] font-bold rounded-full bg-amber-500 text-black px-1.5 py-0.5">{pending}</span>}
                                <Kbd>{n.key}</Kbd>
                            </NavLink>
                        ))}
                    </nav>
                    <div className="ml-auto flex items-center gap-2">
                        <button type="button" onClick={() => setPaletteOpen(true)} className="h-9 rounded-lg bg-black/30 border border-[var(--p-border)] px-3 hidden sm:flex items-center gap-2 text-xs p-muted hover:text-[var(--p-text)] p-ring"><FaSearch />Ara <Kbd>⌘K</Kbd></button>
                        {isAdmin && <NavLink to="/cpl-manage" className="hidden sm:inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs border border-indigo-400/30 text-indigo-300 hover:bg-indigo-500/10 p-ring" title="Yönetim paneli"><FaUserShield />Yönetim</NavLink>}
                        <div className="flex items-center gap-2 pl-2 border-l border-[var(--p-border)]">
                            <Avatar user={user} size={28} />
                            <span className="hidden md:block text-sm font-medium">{user?.username}</span>
                            <NavLink to="/mod/security" className="h-9 w-9 rounded-lg grid place-items-center p-muted hover:text-[var(--p-text)] hover:bg-white/[0.06] p-ring" aria-label="Güvenlik" title="Güvenlik / passkey"><FaFingerprint /></NavLink>
                            <button type="button" onClick={() => logout().then(() => navigate('/mod/login'))} className="h-9 w-9 rounded-lg grid place-items-center p-muted hover:text-rose-300 hover:bg-rose-500/10 p-ring" aria-label="Çıkış yap" title="Çıkış"><FaSignOutAlt /></button>
                        </div>
                        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="md:hidden h-9 w-9 rounded-lg grid place-items-center hover:bg-white/[0.06] p-ring" aria-label="Menü"><FaBars /></button>
                    </div>
                </div>
                {menuOpen && (
                    <nav className="md:hidden border-t border-[var(--p-border)] px-4 py-2 grid grid-cols-2 gap-1">
                        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex items-center gap-2 h-10 px-3 rounded-lg text-sm ${isActive ? 'bg-white/[0.1] font-semibold' : 'p-muted'}`}><n.icon className="text-xs" />{n.label}{n.badge && pending > 0 && <span className="ml-auto text-[10px] font-bold rounded-full bg-amber-500 text-black px-1.5 py-0.5">{pending}</span>}</NavLink>)}
                    </nav>
                )}
            </header>
            <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-5"><Outlet context={{ dash }} /></main>
            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} panel="mod" />
        </div>
    );
}
