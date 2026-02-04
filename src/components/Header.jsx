import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FaSearch, FaBell, FaHeart, FaMoon, FaSun, FaBars, FaTimes, FaHome, FaQuestionCircle, FaEnvelope, FaUser, FaSignInAlt, FaUserPlus, FaSignOutAlt, FaChevronRight, FaMedal, FaUsers, FaInstagram, FaFacebook, FaTwitter, FaDownload, FaTimes as FaClose, FaCompass, FaRobot, FaFire, FaLifeRing, FaComment, FaStar, FaPoll, FaCrown, FaApple, FaYoutube, FaGooglePlay } from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import UserAvatar from './UserAvatar';
import { categoriesAPI, questionsAPI } from '../services/api';
import { getCategoryIcon } from '../utils/categoryIcons';

const Header = ({ onSearch }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef(null);

    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [isQuestionsModalOpen, setIsQuestionsModalOpen] = useState(false);
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [selectedModalCategory, setSelectedModalCategory] = useState(null);
    const { isDark, toggleTheme } = useTheme();
    const { user, isAuthenticated, logout } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
            navigate('/');
        } catch (error) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            navigate('/');
        }
    };

    // Sorular modal'ını aç ve kategorileri yükle
    const openQuestionsModal = async () => {
        setIsQuestionsModalOpen(true);
        if (categories.length === 0) {
            setLoadingCategories(true);
            try {
                const response = await categoriesAPI.getAll();
                setCategories(response.data.data.categories || []);
            } catch (err) {
                console.error('Kategoriler yüklenirken hata:', err);
            } finally {
                setLoadingCategories(false);
            }
        }
    };

    const handleCategorySelect = (slug) => {
        setIsQuestionsModalOpen(false);
        navigate(`/questions/${slug}`);
    };


    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Instant Search with Debounce
    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                setIsSearching(true);
                setShowDropdown(true);
                try {
                    const response = await questionsAPI.getAll({
                        search: searchQuery,
                        limit: 5 // Get top 5 results
                    });
                    setSearchResults(response.data.data.questions || []);
                } catch (error) {
                    console.error('Search error:', error);
                    setSearchResults([]);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
                setShowDropdown(false);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    // Navigate to full results
    const handleFullSearch = () => {
        setShowDropdown(false);
        if (onSearch) {
            onSearch(searchQuery);
        } else {
            navigate(`/questions?search=${encodeURIComponent(searchQuery)}`);
        }
    };

    // Navigate to single result
    const handleResultClick = (slug) => {
        setShowDropdown(false);
        setSearchQuery(''); // Optional: clear search after selection
        navigate(`/question/${slug}`);
    };

    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
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
                    <Link to="/" className="flex items-center gap-2 shrink-0 hover:opacity-80 transition-opacity min-w-0">
                        <img src="/logo.png" alt="Herkesler Soruyor Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
                        <span className="font-script text-base xs:text-lg sm:text-2xl md:text-3xl lg:text-4xl text-coral font-bold leading-none select-none truncate">
                            <span className="hidden sm:inline">Herkesler Soruyor</span>
                            <span className="sm:hidden">HS</span>
                        </span>
                    </Link>

                    {/* Desktop Search Bar */}
                    <div className="hidden md:flex flex-1 max-w-xl relative" ref={searchRef}>
                        <div className="relative w-full">
                            <input
                                type="text"
                                placeholder="Binlerce soru arasında ara..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
                                onKeyDown={(e) => e.key === 'Enter' && handleFullSearch()}
                                className="w-full bg-white dark:bg-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 rounded-2xl py-2.5 pl-4 pr-12 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all font-sans text-sm relative z-10"
                            />
                            <button
                                onClick={handleFullSearch}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-coral transition-colors z-20"
                            >
                                <FaSearch />
                            </button>
                        </div>

                        {/* Instant Search Dropdown */}
                        {showDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-0 animate-in fade-in slide-in-from-top-2 duration-200">
                                {isSearching ? (
                                    <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-coral border-t-transparent mx-auto mb-2"></div>
                                        Aranıyor...
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    <>
                                        <div className="py-2">
                                            {searchResults.map((result) => (
                                                <div
                                                    key={result.id}
                                                    onClick={() => handleResultClick(result.slug)}
                                                    className="group px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer flex items-center gap-4 transition-all border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                                                >
                                                    <div className="shrink-0">
                                                        {result.user ? (
                                                            <UserAvatar user={result.user} size="md" className="w-10 h-10 border-2 border-white dark:border-gray-600 shadow-sm group-hover:border-coral/50 transition-colors" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400">
                                                                <FaSearch />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate group-hover:text-coral transition-colors">
                                                            {result.title}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                                {result.category}
                                                            </span>
                                                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate flex items-center gap-1">
                                                                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                                                                @{result.user?.username || 'anonim'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="text-gray-300 group-hover:text-coral transition-colors">
                                                        <FaChevronRight className="text-xs" />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div onClick={handleFullSearch} className="bg-gray-50 dark:bg-gray-700/30 p-3 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700">
                                            <span className="text-sm font-bold text-coral flex items-center justify-center gap-2">
                                                Tüm {searchQuery} sonuçlarını gör
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                                        <p className="text-sm">"{searchQuery}" ile ilgili sonuç bulunamadı.</p>
                                    </div>
                                )}
                            </div>
                        )}
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
                        <button 
                            onClick={openQuestionsModal}
                            className="hidden sm:block text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm"
                        >
                            Sorular
                        </button>

                        {/* Communities Button */}
                        <Link to="/communities" className="hidden sm:block">
                            <button className="text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-2xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-sm">
                                Topluluk
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

                        {/* Desktop Auth Buttons - Only show if NOT authenticated */}


                        {/* Messages Button */}
                        <Link
                            to="/messages"
                            className="hidden md:block p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                            title="Mesajlar"
                        >
                            <FaEnvelope className="text-base sm:text-lg" />
                        </Link>

                        {/* Notifications */}
                        <NotificationBell />
                        {/* Profile Picture */}


                        {/* User Menu or Auth Buttons */}
                        {isAuthenticated && user ? (
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    <UserAvatar user={user} size="sm" className="w-8 h-8 text-xs" />
                                    <span className="hidden md:inline text-sm font-semibold text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{user.username}</span>
                                </button>

                                {/* Dropdown Menu */}
                                <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 transform group-hover:translate-y-0 translate-y-2">
                                    <div className="p-3 border-b border-gray-100 dark:border-gray-700">
                                        <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{user.name || user.username}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                                    </div>
                                    <div className="p-2">
                                        <Link
                                            to={`/profile/${user.username}`}
                                            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            <FaUser className="text-gray-400" />
                                            Profilim
                                        </Link>
                                        <Link
                                            to="/messages"
                                            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors md:hidden"
                                        >
                                            <FaEnvelope className="text-gray-400" />
                                            Mesajlar
                                        </Link>
                                        <Link
                                            to="/follow-requests"
                                            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            <FaUserPlus className="text-purple-500" />
                                            <span>Takip İstekleri</span>
                                        </Link>
                                        <Link
                                            to="/settings"
                                            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            <FaUser className="text-gray-400" />
                                            Ayarlar
                                        </Link>
                                        <button
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-colors mt-1"
                                        >
                                            <FaSignOutAlt />
                                            Çıkış Yap
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            !isAuthenticated && (
                                <div className="flex items-center gap-2">
                                    <Link
                                        to="/login"
                                        className="hidden sm:block px-4 py-2 text-sm rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-semibold"
                                    >
                                        Giriş Yap
                                    </Link>
                                    <Link
                                        to="/signup"
                                        className="hidden sm:block px-4 py-2 text-sm rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white hover:shadow-lg hover:scale-105 transition-all font-semibold"
                                    >
                                        Kayıt Ol
                                    </Link>
                                </div>
                            )
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
                        {isAuthenticated && user ? (
                            <Link to={`/profile/${user.username}`} onClick={closeMobileMenu} className="flex items-center gap-3">
                                <UserAvatar user={user} size="lg" className="w-12 h-12 text-base border-2 border-coral" />
                                <div>
                                    <p className="font-semibold text-gray-800 dark:text-white">{user.username}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                </div>
                            </Link>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    <FaUser className="text-gray-400 text-xl" />
                                </div>
                                <div>
                                    <p className="font-semibold text-gray-800 dark:text-white">Misafir Kullanıcı</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Hoş geldiniz</p>
                                </div>
                            </div>
                        )}
                        <button
                            onClick={closeMobileMenu}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <FaTimes className="text-xl text-gray-700 dark:text-gray-300" />
                        </button>
                    </div>

                    {/* Mobile Menu Links */}
                    <nav className="flex-1 overflow-y-auto p-4">
                        <button
                            onClick={() => {
                                closeMobileMenu();
                                navigate('/questions');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] text-left"
                        >
                            <FaHome className="text-xl text-coral flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Sorular</span>
                        </button>

                        <Link
                            to="/communities"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaUsers className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Topluluk</span>
                        </Link>

                        {isAuthenticated ? (
                            <>
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
                                    to="/follow-requests"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <FaUserPlus className="text-xl text-purple-500" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Takip İstekleri</span>
                                </Link>
                                <Link
                                    to={`/profile/${user?.username}`}
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <FaUser className="text-xl text-coral" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Profilim</span>
                                </Link>
                                <Link
                                    to="/settings"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <FaUser className="text-xl text-coral" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Ayarlar</span>
                                </Link>
                                <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
                                <button
                                    onClick={() => {
                                        handleLogout();
                                        closeMobileMenu();
                                    }}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors mb-2 min-h-[50px] text-red-600 dark:text-red-400"
                                >
                                    <FaSignOutAlt className="text-xl" />
                                    <span className="font-medium">Çıkış Yap</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
                                <Link
                                    to="/login"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <FaSignInAlt className="text-xl text-gray-600 dark:text-gray-400" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Giriş Yap</span>
                                </Link>
                                <Link
                                    to="/signup"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors min-h-[50px]"
                                >
                                    <FaUserPlus className="text-xl text-gray-600 dark:text-gray-400" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Kayıt Ol</span>
                                </Link>
                            </>
                        )}
                    </nav>

                    {/* Mobile Menu Footer */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                            © 2026 Herkesler Soruyor
                        </p>
                    </div>
                </div>
            </div>

{/* Mega Menu Modal */}
            {isQuestionsModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center animate-in fade-in duration-200 p-4 pt-8"
                    onClick={() => setIsQuestionsModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-gray-800 w-full max-w-6xl max-h-[85vh] flex animate-in zoom-in-95 duration-300 overflow-hidden rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left Side - 2 Column Grid Menu */}
                        <div className="w-full lg:w-2/3 bg-white dark:bg-gray-800 overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Keşfet</h2>
                                <button
                                    onClick={() => setIsQuestionsModalOpen(false)}
                                    className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    <FaClose className="text-lg text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>

                            {/* Menu Grid */}
                            <div className="flex-1 px-6 py-4 overflow-y-auto min-h-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                    {/* Keşfet */}
                                    <div className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 transition-all">
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaCompass />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Keşfet</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">HerkeslerSoruyor'da şu an neler oluyor, hemen gör.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Popüler */}
                                    <div className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 transition-all">
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaFire />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Popüler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Günün çok konuşulanlarına göz at.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Yardım Bekleyenler */}
                                    <div className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 transition-all">
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaLifeRing />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Yardım Bekleyenler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Desteğini bekleyen sorular, yardımcı cevaplar.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* BiBilenler */}
                                    <div className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 transition-all">
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaStar />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">BiBilenler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Alanında uzman profesyonel BiBilenlere danış.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Yapay Zeka */}
                                    <div className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 transition-all">
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaRobot />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Yapay Zeka</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Yapay zeka fenomenleri sorularını cevaplıyor, hemen sor!</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sorular - Tıklanabilir */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaQuestionCircle />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Sorular</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">İlgini çekebilecek sorulara cevap paylaş.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Görüşler */}
                                    <div
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/opinions');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaComment />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Görüşler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Konular hakkında yazılar oku, kendi görüşünü paylaş.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Anketler */}
                                    <div
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions?has_poll=1');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-gray-600 dark:text-gray-400 flex-shrink-0">
                                                <FaPoll />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base">Anketler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">İlgi çekici anketlere oy ver, gündemi belirle.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer - Links & Social Media */}
                            <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3 bg-white dark:bg-gray-800 shrink-0">
                                {/* Footer Links */}
                                <div className="flex flex-wrap gap-2 mb-2">
                                    <Link to="/iletisim" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        İletişim
                                    </Link>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Link to="/yayin-ilkeleri" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        Yayın İlkeleri
                                    </Link>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Link to="/site-sozlesmesi" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        Site Sözleşmesi
                                    </Link>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Link to="/kvkk-aydinlatma" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        KVKK Aydınlatma
                                    </Link>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Link to="/etiketler" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        Etiketler
                                    </Link>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Link to="/opinions" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        Görüşler
                                    </Link>
                                    <span className="text-xs text-gray-400">•</span>
                                    <Link to="/questions" onClick={() => setIsQuestionsModalOpen(false)} className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                                        Tüm Sorular
                                    </Link>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 items-center justify-between">
                                    {/* Social Media Icons */}
                                    <div className="flex gap-1.5 items-center flex-wrap">
                                        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mr-1">Bizi Takip Et:</span>
                                        <div className="flex gap-1.5">
                                            <a href="https://twitter.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gradient-to-br from-sky-400 to-blue-500 text-white rounded-lg hover:shadow-md hover:scale-110 transition-all" title="X (Twitter)">
                                                <FaTwitter className="text-xs" />
                                            </a>
                                            <a href="https://facebook.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg hover:shadow-md hover:scale-110 transition-all" title="Facebook">
                                                <FaFacebook className="text-xs" />
                                            </a>
                                            <a href="https://instagram.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gradient-to-br from-pink-500 via-red-500 to-orange-400 text-white rounded-lg hover:shadow-md hover:scale-110 transition-all" title="Instagram">
                                                <FaInstagram className="text-xs" />
                                            </a>
                                            <a href="https://youtube.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-1.5 bg-gradient-to-br from-red-600 to-red-700 text-white rounded-lg hover:shadow-md hover:scale-110 transition-all" title="YouTube">
                                                <FaYoutube className="text-xs" />
                                            </a>
                                        </div>
                                    </div>
                                    {/* App Store Button */}
                                    <div className="flex gap-2">
                                        <a href="https://play.google.com/store/apps/details?id=com.herkeslersoruyor.app" target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white text-xs font-bold rounded-lg hover:shadow-lg hover:from-gray-800 hover:to-gray-900 transition-all flex items-center gap-1.5 whitespace-nowrap">
                                            <FaGooglePlay className="text-xs" /> Google Play
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side - Categories List */}
                        <div className="hidden lg:flex lg:w-1/3 flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                            {/* Categories Header */}
                            <div className="sticky top-0 border-b border-gray-200 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-900">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                                        Konular <span className="font-normal text-gray-600 dark:text-gray-400">({categories.length})</span>
                                    </h3>
                                    <Link 
                                        to="/questions" 
                                        onClick={() => setIsQuestionsModalOpen(false)} 
                                        className="px-2.5 py-1 rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Tümü
                                    </Link>
                                </div>
                            </div>

                            {/* Categories List */}
                            <div className="px-5 py-4 space-y-2.5 overflow-y-auto flex-1 max-h-[calc(70vh-120px)]">
                                {loadingCategories ? (
                                    <div className="flex justify-center items-center py-12">
                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-400 border-t-transparent"></div>
                                    </div>
                                ) : (
                                    categories.map((cat) => {
                                        const CategoryIcon = getCategoryIcon(cat.name);
                                        return (
                                            <button
                                                key={cat.id}
                                                onClick={() => handleCategorySelect(cat.slug)}
                                                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all group"
                                            >
                                                {/* Category Icon */}
                                                <div 
                                                    style={{ backgroundColor: cat.color || '#6B7280' }}
                                                    className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-white"
                                                >
                                                    <CategoryIcon className="text-base" />
                                                </div>
                                                {/* Category Name */}
                                                <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                    {cat.name}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Header;

