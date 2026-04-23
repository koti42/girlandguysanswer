import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import {
    FaHome,
    FaUsers,
    FaExclamationTriangle,
    FaQuestionCircle,
    FaComments,
    FaUserShield,
    FaBars,
    FaTimes,
    FaSignOutAlt,
    FaMoon,
    FaSun,
    FaChevronDown,
    FaReply,
    FaEdit,
    FaBell,
    FaCog,
    FaFlag,
} from 'react-icons/fa';

const AdminLayout = () => {
    const { admin, logout } = useAdminAuth();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    const toggleDarkMode = () => {
        const newMode = !darkMode;
        setDarkMode(newMode);
        if (newMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/cpl-manage/login');
    };

    const menuItems = [
        {
            label: 'Ana Menü',
            items: [
                { path: '/cpl-manage', icon: FaHome, label: 'Dashboard', exact: true },
                { path: '/cpl-manage/complaints', icon: FaExclamationTriangle, label: 'Şikayetler', badge: 'hot' },
            ]
        },
        {
            label: 'Kullanıcı Yönetimi',
            items: [
                { path: '/cpl-manage/users', icon: FaUsers, label: 'Kullanıcılar' },
                { path: '/cpl-manage/roles', icon: FaUserShield, label: 'Roller' },
            ]
        },
        {
            label: 'İçerik Yönetimi',
            items: [
                { path: '/cpl-manage/questions', icon: FaQuestionCircle, label: 'Sorular' },
                { path: '/cpl-manage/opinions', icon: FaEdit, label: 'Görüşler' },
                { path: '/cpl-manage/answers', icon: FaReply, label: 'Cevaplar' },
                { path: '/cpl-manage/comments', icon: FaComments, label: 'Yorumlar' },
            ]
        },
        {
            label: 'Site Ayarları',
            items: [
                { path: '/cpl-manage/special-days', icon: FaFlag, label: 'Özel Gün Rozetleri' },
            ]
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-slate-100 dark:from-gray-900 dark:via-slate-900 dark:to-gray-900 flex">
            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-r border-gray-200/50 dark:border-gray-700/50 transform transition-transform duration-300 lg:translate-x-0 flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* Logo */}
                <div className="h-20 flex items-center justify-between px-6 border-b border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-coral via-orange-500 to-pink-500 flex items-center justify-center shadow-lg shadow-coral/30">
                            <FaCog className="text-white text-lg" />
                        </div>
                        <div>
                            <span className="text-lg font-bold bg-gradient-to-r from-coral to-orange-500 bg-clip-text text-transparent">
                                Admin Panel
                            </span>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Yönetim Merkezi</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <FaTimes className="text-gray-600 dark:text-gray-400" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                    {menuItems.map((section, sectionIndex) => (
                        <div key={sectionIndex}>
                            <p className="px-4 mb-2 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                {section.label}
                            </p>
                            <div className="space-y-1">
                                {section.items.map((item) => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        end={item.exact}
                                        className={({ isActive }) =>
                                            `group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${isActive
                                                ? 'bg-gradient-to-r from-coral/10 to-orange-500/10 text-coral font-semibold shadow-sm'
                                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                                            }`
                                        }
                                        onClick={() => setSidebarOpen(false)}
                                    >
                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${'bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'
                                            }`}>
                                            <item.icon className="text-base" />
                                        </div>
                                        <span className="flex-1">{item.label}</span>
                                        {item.badge === 'hot' && (
                                            <span className="px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full animate-pulse">
                                                !
                                            </span>
                                        )}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* User Card in Sidebar */}
                <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/50 border border-gray-200/50 dark:border-gray-700/50">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-coral to-orange-500 flex items-center justify-center text-white font-bold">
                                {admin?.username?.[0]?.toUpperCase() || 'A'}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-gray-900 dark:text-white truncate">
                                    {admin?.username || 'Admin'}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    {admin?.email}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors text-sm font-medium"
                        >
                            <FaSignOutAlt />
                            Çıkış Yap
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Header */}
                <header className="h-20 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-gray-700/50 flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
                    {/* Left: Hamburger */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="lg:hidden p-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <FaBars className="text-gray-600 dark:text-gray-400 text-lg" />
                    </button>

                    {/* Center: Search (desktop) */}
                    <div className="hidden lg:flex flex-1 max-w-md">
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder="Ara..."
                                className="w-full pl-12 pr-4 py-3 bg-gray-100 dark:bg-gray-800 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30"
                            />
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        {/* Notifications */}
                        <button className="relative p-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <FaBell className="text-gray-600 dark:text-gray-400" />
                            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                        </button>

                        {/* Dark Mode Toggle */}
                        <button
                            onClick={toggleDarkMode}
                            className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            title={darkMode ? 'Açık Mod' : 'Koyu Mod'}
                        >
                            {darkMode ? (
                                <FaSun className="text-yellow-500" />
                            ) : (
                                <FaMoon className="text-gray-600" />
                            )}
                        </button>

                        {/* User Menu (mobile) */}
                        <div className="relative lg:hidden">
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            >
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-coral to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                                    {admin?.username?.[0]?.toUpperCase() || 'A'}
                                </div>
                            </button>

                            {userMenuOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-40"
                                        onClick={() => setUserMenuOpen(false)}
                                    />
                                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 py-2 z-50">
                                        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                            <p className="font-semibold text-gray-900 dark:text-white truncate">
                                                {admin?.username}
                                            </p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                                {admin?.email}
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <FaSignOutAlt />
                                            Çıkış Yap
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
