import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaSearch, FaBell, FaHeart, FaMoon, FaSun, FaBars, FaTimes, FaHome, FaQuestionCircle, FaEnvelope, FaUser, FaSignInAlt, FaUserPlus, FaSignOutAlt } from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import NotificationDropdown from './NotificationDropdown';
import { notifications } from '../data/mockData';

const Header = ({ onSearch }) => {
    const navigate = useNavigate();
    const [searchQuery, setSearchQuery] = useState('');
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const { isDark, toggleTheme } = useTheme();
    const { user, isAuthenticated, logout } = useAuth();

    const unreadCount = notifications.filter(n => !n.read).length;

    // Ref for notifications dropdown
    const notificationsRef = useRef(null);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // Close notifications when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
                setIsNotificationsOpen(false);
            }
        };

        if (isNotificationsOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isNotificationsOpen]);

    const handleSearchChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        if (onSearch) {
            onSearch(query);
        }
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
    };

    return (
        <>
            <header className="sticky top-0 z-50 bg-background/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 shadow-sm py-2 px-2 sm:px-4 md:px-8">
                <div className="max-w-7xl mx-auto flex items-center justify-between gap-1 sm:gap-2 md:gap-4">
                    {/* Mobile Menu Button */}
                    <button
                        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <FaBars className="text-xl text-gray-700 dark:text-gray-300" />
                    </button>

                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-1 shrink-0 hover:opacity-80 transition-opacity min-w-0">
                        <span className="font-script text-base xs:text-lg sm:text-2xl md:text-3xl lg:text-4xl text-coral font-bold leading-none select-none truncate">
                            <span className="hidden sm:inline">Kızılınkalarsoruyor</span>
                            <span className="sm:hidden">K.Q</span>
                        </span>
                        <div className="relative hidden sm:block">
                            <FaHeart className="text-gold text-xl md:text-2xl" />
                            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold text-xs">?</span>
                        </div>
                    </Link>

                    {/* Desktop Search Bar */}
                    <div className="hidden md:flex flex-1 max-w-xl relative">
                        <input
                            type="text"
                            placeholder="Binlerce soru arasında ara..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="w-full bg-white dark:bg-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 rounded-2xl py-2.5 pl-4 pr-12 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all font-sans text-sm"
                        />
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-coral transition-colors">
                            <FaSearch />
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2 shrink-0">
                        {/* Mobile Search Button */}
                        <button
                            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
                            className="md:hidden p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                        >
                            <FaSearch className="text-base sm:text-lg" />
                        </button>

                        {/* Dark Mode Toggle */}
                        <button
                            onClick={toggleTheme}
                            className="hidden sm:block p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                            title={isDark ? 'Açık Mod' : 'Koyu Mod'}
                        >
                            {isDark ? <FaSun className="text-base sm:text-lg" /> : <FaMoon className="text-base sm:text-lg" />}
                        </button>

                        {/* Questions Button */}
                        <Link to="/questions" className="hidden sm:block">
                            <button className="text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm">
                                Sorular
                            </button>
                        </Link>

                        {/* Ask Question Button */}
                        <Link
                            to="/ask"
                            className="bg-gradient-to-r from-coral to-orange-400 text-white px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-2.5 rounded-full font-semibold hover:shadow-lg transition-all duration-300 text-xs sm:text-sm md:text-base whitespace-nowrap"
                        >
                            <span className="hidden sm:inline">Soru Sor</span>
                            <span className="sm:hidden">+</span>
                        </Link>

                        {/* Desktop Auth Buttons */}
                        <Link to="/login" className="hidden lg:block">
                            <button className="text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm">
                                Giriş
                            </button>
                        </Link>
                        <Link to="/signup" className="hidden lg:block">
                            <button className="bg-gray-800 dark:bg-gray-700 text-white font-semibold py-2 px-4 rounded-2xl hover:bg-gray-700 dark:hover:bg-gray-600 transition-all text-sm">
                                Kayıt Ol
                            </button>
                        </Link>

                        {/* Messages Button */}
                        <Link
                            to="/messages"
                            className="hidden md:block p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                            title="Mesajlar"
                        >
                            <FaEnvelope className="text-base sm:text-lg" />
                        </Link>

                        {/* Notifications */}
                        <div className="relative" ref={notificationsRef}>
                            <button
                                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                                className="relative p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                            >
                                <FaBell className="text-base sm:text-lg" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 bg-coral text-white text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                            <NotificationDropdown
                                isOpen={isNotificationsOpen}
                                onClose={() => setIsNotificationsOpen(false)}
                            />
                        </div>
                        {/* Profile Picture */}
                        <Link to="/profile/Zeynep_Yildiz" className="hidden sm:block">
                            <img
                                src="https://i.pravatar.cc/150?u=a042581f4e29026024d"
                                alt="User"
                                className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-700 shadow-md cursor-pointer hover:border-coral transition-colors"
                            />
                        </Link>

                        {/* User Menu or Auth Buttons */}
                        {isAuthenticated ? (
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    <FaUser className="text-gray-600 dark:text-gray-300" />
                                    <span className="hidden md:inline text-sm font-semibold text-gray-700 dark:text-gray-300">{user?.username}</span>
                                </button>

                                {/* Dropdown Menu */}
                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                                    <Link
                                        to={`/profile/${user?.username}`}
                                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                                    >
                                        Profilim
                                    </Link>
                                    <button
                                        onClick={handleLogout}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg flex items-center gap-2"
                                    >
                                        <FaSignOutAlt />
                                        Çıkış Yap
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="hidden sm:block px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-medium"
                                >
                                    Giriş
                                </Link>
                                <Link
                                    to="/signup"
                                    className="hidden sm:block px-3 py-2 text-sm rounded-lg bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:shadow-lg transition-all font-medium"
                                >
                                    Kayıt Ol
                                </Link>
                            </>
                        )}
                    </div>
                </div>

                {/* Mobile Search Bar (Expandable) */}
                {isMobileSearchOpen && (
                    <div className="md:hidden mt-3 relative">
                        <input
                            type="text"
                            placeholder="Ara..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            className="w-full bg-white dark:bg-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 rounded-2xl py-2.5 pl-4 pr-12 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all font-sans text-sm"
                            autoFocus
                        />
                        <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-coral transition-colors">
                            <FaSearch />
                        </button>
                    </div>
                )}
            </header>

            {/* Mobile Menu Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={closeMobileMenu}
                />
            )}

            {/* Mobile Menu Sidebar */}
            <div
                className={`fixed top-0 left-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 md:hidden ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Mobile Menu Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                        <Link to="/profile/Zeynep_Yildiz" onClick={closeMobileMenu} className="flex items-center gap-3">
                            <img
                                src="https://i.pravatar.cc/150?u=a042581f4e29026024d"
                                alt="User"
                                className="w-12 h-12 rounded-full border-2 border-coral"
                            />
                            <div>
                                <p className="font-semibold text-gray-800 dark:text-white">Zeynep Yıldız</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">@Zeynep_Yildiz</p>
                            </div>
                        </Link>
                        <button
                            onClick={closeMobileMenu}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <FaTimes className="text-xl text-gray-700 dark:text-gray-300" />
                        </button>
                    </div>

                    {/* Mobile Menu Links */}
                    <nav className="flex-1 overflow-y-auto p-4">
                        <Link
                            to="/questions"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaHome className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Sorular</span>
                        </Link>
                        <Link
                            to="/ask"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaQuestionCircle className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Soru Sor</span>
                        </Link>
                        <Link
                            to="/messages"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaEnvelope className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Mesajlar</span>
                        </Link>
                        <Link
                            to="/profile/Zeynep_Yildiz"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaUser className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Profilim</span>
                        </Link>

                        <div className="border-t border-gray-200 dark:border-gray-700 my-4" />

                        <Link
                            to="/login"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] lg:hidden"
                        >
                            <FaSignInAlt className="text-xl text-gray-600 dark:text-gray-400" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Giriş Yap</span>
                        </Link>
                        <Link
                            to="/signup"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[50px] lg:hidden"
                        >
                            <FaUserPlus className="text-xl text-gray-600 dark:text-gray-400" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Kayıt Ol</span>
                        </Link>
                    </nav>

                    {/* Mobile Menu Footer */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            © 2026 Kızilinkalarsoruyor
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default Header;
