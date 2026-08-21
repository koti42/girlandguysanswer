import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaSearch, FaBell, FaHeart, FaMoon, FaSun, FaBars, FaTimes, FaHome, FaQuestionCircle, FaEnvelope, FaUser, FaSignInAlt, FaUserPlus, FaSignOutAlt, FaChevronRight, FaMedal, FaUsers, FaInstagram, FaFacebook, FaTwitter, FaDownload, FaTimes as FaClose, FaCompass, FaRobot, FaFire, FaLifeRing, FaComment, FaStar, FaPoll, FaCrown, FaApple, FaYoutube, FaGooglePlay, FaUserShield, FaBookOpen } from 'react-icons/fa';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';
import UserAvatar from './UserAvatar';
import QuickAskModal from './QuickAskModal';
import { categoriesAPI, messagesAPI, questionsAPI, specialDaysAPI, usersAPI } from '../services/api';

const Header = ({ onSearch }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [searchResults, setSearchResults] = useState([]);
    const [userResults, setUserResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const searchRef = useRef(null);

    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [isQuestionsModalOpen, setIsQuestionsModalOpen] = useState(false);
    const [showQuickAskModal, setShowQuickAskModal] = useState(false);
    const [unreadMessageCount, setUnreadMessageCount] = useState(0);
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [selectedModalCategory, setSelectedModalCategory] = useState(null);
    const [modalActiveTab, setModalActiveTab] = useState('tum-sorular'); // tum-sorular, populer, cevapsiz
    const [activeSpecialDays, setActiveSpecialDays] = useState([]);
    const [scrolled, setScrolled] = useState(false);
    const { isDark, toggleTheme } = useTheme();
    const { user, isAuthenticated, logout } = useAuth();

    // Anasayfada tepedeyken header şeffaf, scroll edilince buzlu cam olur
    const isHome = location.pathname === '/';
    const transparent = isHome && !scrolled;

    useEffect(() => {
        if (!isHome) {
            setScrolled(false);
            return;
        }
        const onScroll = () => setScrolled(window.scrollY > 24);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, [isHome]);

    // Özel Gün Rozetleri - API'den çek
    useEffect(() => {
        const fetchSpecialDays = async () => {
            try {
                const res = await specialDaysAPI.getActive();
                setActiveSpecialDays(res.data?.data || []);
            } catch {
                setActiveSpecialDays([]);
            }
        };
        fetchSpecialDays();
        // Her 5 dakikada bir güncelle
        const interval = setInterval(fetchSpecialDays, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        let intervalId;
        let isMounted = true;

        const syncUnreadMessages = async () => {
            if (!isAuthenticated) {
                if (isMounted) setUnreadMessageCount(0);
                return;
            }

            try {
                const response = await messagesAPI.getConversations();
                const conversations = response.data?.data || [];
                const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0);
                if (isMounted) {
                    setUnreadMessageCount(totalUnread);
                }
            } catch (error) {
                if (isMounted) {
                    setUnreadMessageCount(0);
                }
            }
        };

        syncUnreadMessages();
        intervalId = setInterval(syncUnreadMessages, 15000);

        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [isAuthenticated, location.pathname]);

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


    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchRef.current && !searchRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            if (searchQuery.trim().length >= 2) {
                setIsSearching(true);
                setShowDropdown(true);
                try {
                    const [questionsRes, usersRes] = await Promise.allSettled([
                        questionsAPI.getAll({
                            search: searchQuery,
                            limit: 5 // Get top 5 results
                        }),
                        usersAPI.search(searchQuery, 5)
                    ]);

                    if (questionsRes.status === 'fulfilled') {
                        setSearchResults(questionsRes.value.data.data.questions || []);
                    } else {
                        setSearchResults([]);
                    }

                    if (usersRes.status === 'fulfilled') {
                        setUserResults(usersRes.value.data.data.users || []);
                    } else {
                        setUserResults([]);
                    }
                } catch (error) {
                    console.error('Search error:', error);
                    setSearchResults([]);
                    setUserResults([]);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
                setUserResults([]);
                setShowDropdown(false);
            }
        }, 500);

        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleFullSearch = () => {
        setShowDropdown(false);
        setIsMobileSearchOpen(false);
        if (onSearch) {
            onSearch(searchQuery);
        } else {
            navigate(`/questions?search=${encodeURIComponent(searchQuery)}`);
        }
    };

    // Navigate to single result
    const handleResultClick = (slug) => {
        setShowDropdown(false);
        setIsMobileSearchOpen(false);
        setSearchQuery(''); // Optional: clear search after selection
        navigate(`/question/${slug}`);
    };

    // Navigate to a user profile
    const handleUserClick = (username) => {
        setShowDropdown(false);
        setIsMobileSearchOpen(false);
        setSearchQuery('');
        navigate(`/profile/${username}`);
    };

    const handleSearchChange = (e) => {
        setSearchQuery(e.target.value);
    };

    const closeMobileMenu = () => {
        setIsMobileMenuOpen(false);
    };

    // Shared instant-search dropdown content (used by desktop + mobile)
    const renderSearchDropdownContent = () => {
        if (isSearching) {
            return (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400 text-sm">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-coral border-t-transparent mx-auto mb-2"></div>
                    Aranıyor...
                </div>
            );
        }

        const hasResults = userResults.length > 0 || searchResults.length > 0;

        if (!hasResults) {
            return (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                    <p className="text-sm">"{searchQuery}" ile ilgili sonuç bulunamadı.</p>
                </div>
            );
        }

        return (
            <>
                {userResults.length > 0 && (
                    <div className="py-2 border-b border-gray-100 dark:border-gray-700">
                        <p className="px-4 pb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Kullanıcılar</p>
                        {userResults.map((u) => (
                            <div
                                key={`user-${u.id}`}
                                onClick={() => handleUserClick(u.username)}
                                className="group px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer flex items-center gap-3 transition-all"
                            >
                                <UserAvatar user={u} size="md" className="w-9 h-9 border-2 border-white dark:border-gray-600 shadow-sm group-hover:border-coral/50 transition-colors" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm truncate group-hover:text-coral transition-colors">
                                        @{u.username}
                                    </p>
                                    {u.bio && (
                                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.bio}</p>
                                    )}
                                </div>
                                <FaUser className="text-xs text-gray-300 group-hover:text-coral transition-colors" />
                            </div>
                        ))}
                    </div>
                )}

                {searchResults.length > 0 && (
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
                                            {typeof result.category === 'object' ? result.category?.name : result.category}
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
                )}

                <div onClick={handleFullSearch} className="bg-gray-50 dark:bg-gray-700/30 p-3 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700">
                    <span className="text-sm font-bold text-coral flex items-center justify-center gap-2">
                        Tüm "{searchQuery}" sonuçlarını gör
                    </span>
                </div>
            </>
        );
    };

    return (
        <>
            <header
                className={`sticky top-0 z-50 py-2 px-2 sm:px-4 md:px-8 transition-all duration-300 ${
                    transparent
                        ? 'border-b border-transparent shadow-none'
                        : 'bg-background/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700 shadow-sm'
                }`}
                style={
                    transparent
                        ? { background: 'linear-gradient(110deg, #FFE8DC 0%, #FDF6F0 35%, #F2F9FD 65%, #E8F4FC 100%)' }
                        : undefined
                }
            >
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
                        <div className="relative">
                        <picture>
                            <source srcSet="/logo.webp" type="image/webp" />
                            <img src="/logo.png" alt="Herkesler Soruyor Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
                        </picture>
                        </div>
                        <span className="font-script text-base xs:text-lg sm:text-2xl md:text-3xl lg:text-4xl text-coral font-bold leading-none select-none truncate">
                            <span className="hidden sm:inline">Herkesler Soruyor</span>
                            <span className="sm:hidden">HS</span>
                        </span>
                        {/* Özel Gün Rozetleri - API'den yönetilir */}
                        {activeSpecialDays.map((day) => (
                            <span
                                key={day.id}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold shadow-lg select-none shrink-0"
                                style={{
                                    border: `1.5px solid ${day.color}`,
                                    color: day.color,
                                    background: 'white',
                                    animation: 'pulse23 1.8s ease-in-out infinite',
                                }}
                                title={`${day.label} 🎉`}
                            >
                                <span>{day.badge_emoji}</span>
                                <span className="hidden sm:inline font-extrabold tracking-tight">{day.short_label}</span>
                                <span className="sm:hidden font-extrabold">
                                    {day.short_label.split(' ').slice(0, 2).join('\u00A0')}
                                </span>
                                <span>🇹🇷</span>
                            </span>
                        ))}
                    </Link>
                    <style>{`
                        @keyframes pulse23 {
                            0%, 100% { transform: scale(1); box-shadow: 0 0 6px rgba(227,10,23,0.4); }
                            50% { transform: scale(1.07); box-shadow: 0 0 14px rgba(227,10,23,0.7); }
                        }
                    `}</style>

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
                                className={`w-full dark:text-white rounded-full py-2.5 pl-5 pr-12 focus:outline-none focus:bg-white focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all font-sans text-sm relative z-10 ${
                                    transparent
                                        ? 'bg-white/60 dark:bg-gray-800/50 backdrop-blur-md border border-white/60 dark:border-gray-600 shadow-sm placeholder-gray-500'
                                        : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600'
                                }`}
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
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-0 animate-in fade-in slide-in-from-top-2 duration-200 max-h-[70vh] overflow-y-auto">
                                {renderSearchDropdownContent()}
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
                        <button
                            onClick={() => setShowQuickAskModal(true)}
                            className="bg-gradient-to-r from-coral to-orange-400 text-white px-2 py-1.5 sm:px-3 sm:py-2 md:px-4 md:py-2.5 rounded-full font-semibold hover:shadow-lg transition-all duration-300 text-xs sm:text-sm md:text-base whitespace-nowrap"
                        >
                            <span className="hidden sm:inline">Soru Sor</span>
                            <span className="sm:hidden">+</span>
                        </button>

                        {/* Desktop Auth Buttons - Only show if NOT authenticated */}


                        {/* Messages Button */}
                        <Link
                            to="/messages"
                            className="hidden md:block relative p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-300"
                            title="Mesajlar"
                        >
                            <FaEnvelope className={`text-base sm:text-lg transition-transform ${unreadMessageCount > 0 ? 'animate-pulse' : ''}`} />
                            {unreadMessageCount > 0 && (
                                <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-lg">
                                    {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                                </span>
                            )}
                        </Link>

                        {/* Notifications */}
                        <NotificationBell />
                        {/* Profile Picture */}


                        {/* User Menu or Auth Buttons */}
                        {isAuthenticated && user ? (
                            <div className="relative group">
                                <button className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all">
                                    <UserAvatar user={user} size="sm" className="w-8 h-8 text-xs" />
                                    <span className="hidden md:inline text-sm font-semibold text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{user.username}</span>
                                </button>

                                {/* Dropdown Menu */}
                                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 transform group-hover:translate-y-0 translate-y-2 overflow-hidden">
                                    {/* Profile Header */}
                                    <div className="relative px-4 pt-4 pb-3 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-700/60 dark:to-gray-800/60 border-b border-gray-100 dark:border-gray-700/60">
                                        <div className="flex items-center gap-3 mb-3">
                                            <UserAvatar user={user} size="md" className="w-10 h-10 text-sm ring-2 ring-white dark:ring-gray-600 shadow-sm flex-shrink-0" />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">{user.name || user.username}</p>
                                                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">@{user.username}</p>
                                            </div>
                                        </div>
                                        {user.levelProgress && (() => {
                                            const pct = Math.min(100, Math.max(0, (user.levelProgress.progress || 0) * 100));
                                            const isMax = !user.levelProgress.next_level_name;
                                            return (
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-base leading-none">
                                                                {user.levelProgress.current_level_icon || '⭐'}
                                                            </span>
                                                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                                {user.levelProgress.current_level_name || 'Seviye'}
                                                            </span>
                                                        </div>
                                                        {isMax ? (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-sm">
                                                                MAX ✨
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                                                %{Math.round(pct)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Progress Bar */}
                                                    <div className="relative w-full h-2 rounded-full bg-gray-200/80 dark:bg-gray-600/60 overflow-hidden">
                                                        <div
                                                            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 transition-all duration-700"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                        {/* Shimmer */}
                                                        <div
                                                            className="absolute inset-y-0 left-0 rounded-full overflow-hidden"
                                                            style={{ width: `${pct}%` }}
                                                        >
                                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
                                                        </div>
                                                    </div>
                                                    {!isMax && (
                                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                                                            Sonraki: <span className="font-medium text-purple-500 dark:text-purple-400">{user.levelProgress.next_level_name}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })()}
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
                                        {(user?.roles?.some(r => ['admin','super_admin'].includes(r.slug || r)) || user?.role === 'admin' || user?.role === 'super_admin') && (
                                            <Link
                                                to="/cpl-manage"
                                                className="flex items-center gap-3 px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors font-semibold"
                                            >
                                                <FaUserShield className="text-purple-500" />
                                                Admin Panel
                                            </Link>
                                        )}
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
                            placeholder="Soru veya kullanıcı ara..."
                            value={searchQuery}
                            onChange={handleSearchChange}
                            onKeyDown={(e) => e.key === 'Enter' && handleFullSearch()}
                            className="w-full bg-white dark:bg-gray-800 dark:text-white border border-gray-300 dark:border-gray-600 rounded-2xl py-2.5 pl-4 pr-12 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all font-sans text-sm"
                            autoFocus
                        />
                        <button
                            onClick={handleFullSearch}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-coral transition-colors"
                        >
                            <FaSearch />
                        </button>

                        {/* Mobile Instant Search Results */}
                        {searchQuery.trim().length >= 2 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50 max-h-[65vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                                {renderSearchDropdownContent()}
                            </div>
                        )}
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
                                navigate('/');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] text-left"
                        >
                            <FaHome className="text-xl text-coral flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Vitrin</span>
                        </button>

                        <button
                            onClick={() => {
                                closeMobileMenu();
                                navigate('/questions');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] text-left"
                        >
                            <FaQuestionCircle className="text-xl text-coral flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Sorular</span>
                        </button>

                        <button
                            onClick={() => {
                                closeMobileMenu();
                                navigate('/questions?has_poll=1');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] text-left"
                        >
                            <FaPoll className="text-xl text-coral flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Nabız</span>
                        </button>

                        <button
                            onClick={() => {
                                closeMobileMenu();
                                navigate('/opinions');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] text-left"
                        >
                            <FaComment className="text-xl text-coral flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Benceler</span>
                        </button>

                        <button
                            onClick={() => {
                                closeMobileMenu();
                                navigate('/stories');
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px] text-left"
                        >
                            <FaBookOpen className="text-xl text-coral flex-shrink-0" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Hikayeler</span>
                        </button>

                        <Link
                            to="/communities"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaUsers className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Meydan</span>
                        </Link>

                        <Link
                            to="/search"
                            onClick={closeMobileMenu}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                        >
                            <FaSearch className="text-xl text-coral" />
                            <span className="text-gray-700 dark:text-gray-200 font-medium">Bul</span>
                        </Link>

                        {isAuthenticated ? (
                            <>
                                <Link
                                    to="/ask"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <FaQuestionCircle className="text-xl text-coral" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Sor Gitsin</span>
                                </Link>
                                <Link
                                    to="/messages"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <div className="relative">
                                        <FaEnvelope className="text-xl text-coral" />
                                        {unreadMessageCount > 0 && (
                                            <span className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] px-1 flex items-center justify-center shadow-lg">
                                                {unreadMessageCount > 9 ? '9+' : unreadMessageCount}
                                            </span>
                                        )}
                                    </div>
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
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Profil</span>
                                </Link>
                                <Link
                                    to="/settings"
                                    onClick={closeMobileMenu}
                                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mb-2 min-h-[50px]"
                                >
                                    <FaUser className="text-xl text-coral" />
                                    <span className="text-gray-700 dark:text-gray-200 font-medium">Ayarlar</span>
                                </Link>
                                {(user?.roles?.some(r => ['admin','super_admin'].includes(r.slug || r)) || user?.role === 'admin' || user?.role === 'super_admin') && (
                                    <Link
                                        to="/cpl-manage"
                                        onClick={closeMobileMenu}
                                        className="flex items-center gap-3 p-3 rounded-xl hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors mb-2 min-h-[50px]"
                                    >
                                        <FaUserShield className="text-xl text-purple-500" />
                                        <span className="text-purple-600 dark:text-purple-400 font-semibold">Admin Panel</span>
                                    </Link>
                                )}
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
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-in fade-in duration-200"
                    onClick={() => setIsQuestionsModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-gray-800 w-full max-w-6xl max-h-[85vh] flex animate-in zoom-in-95 duration-300 overflow-hidden rounded-2xl shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Left Side - 2 Column Grid Menu (65-70%) */}
                        <div className="w-full lg:w-2/3 bg-white dark:bg-gray-800 overflow-y-auto flex flex-col">
                            {/* Header */}
                            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Pusula</h2>
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
                                    {/* Pusula */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-purple-50 hover:to-indigo-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-coral flex-shrink-0">
                                                <FaCompass />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-coral transition-colors">Pusula</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Herkesler Soruyor'da şu an neler oluyor, hemen gör.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Gündem */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions/populer');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-orange-50 hover:to-red-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-orange-600 dark:text-orange-400 flex-shrink-0">
                                                <FaFire />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-orange-600 transition-colors">Gündem</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Günün çok konuşulanlarına göz at.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dayanışma */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions/yardim-bekleyenler');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-green-50 hover:to-emerald-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-green-600 dark:text-green-400 flex-shrink-0">
                                                <FaLifeRing />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-green-600 transition-colors">Dayanışma</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Desteğini bekleyen sorular, yardımcı cevaplar.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Üstatlar */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/leaderboard');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-purple-50 hover:to-indigo-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-purple-600 dark:text-purple-400 flex-shrink-0">
                                                <FaStar />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-purple-600 transition-colors">Üstatlar</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Alanında uzman profesyonel Üstatlara danış.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Akıl Küpü */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions/yapay-zeka');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-blue-50 hover:to-cyan-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                                                <FaRobot />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-indigo-600 transition-colors">Akıl Küpü</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Yapay zeka fenomenleri sorularını cevaplıyor, hemen sor!</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sorular */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-coral/10 hover:to-orange-100/50 dark:hover:from-coral/20 dark:hover:to-orange-900/20 border border-coral/30 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-coral flex-shrink-0">
                                                <FaQuestionCircle />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-coral transition-colors">Sorular</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">İlgini çekebilecek sorulara cevap paylaş.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Benceler */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/opinions');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-pink-50 hover:to-rose-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-pink-600 dark:text-pink-400 flex-shrink-0">
                                                <FaComment />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-pink-600 transition-colors">Benceler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Konular hakkında yazılar oku, görüşünü paylaş.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Hikayeler */}
                                    <div
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/stories');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-emerald-50 hover:to-teal-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                                                <FaBookOpen />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-emerald-600 transition-colors">Hikayeler</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Uzun hikayeler oku, kendi hikayeni yaz.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Nabız */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/questions?has_poll=1');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-cyan-50 hover:to-blue-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-cyan-600 dark:text-cyan-400 flex-shrink-0">
                                                <FaPoll />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-cyan-600 transition-colors">Nabız</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">İlgi çekici anketlere oy ver, gündemi belirle.</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Meydan */}
                                    <div 
                                        onClick={() => {
                                            setIsQuestionsModalOpen(false);
                                            navigate('/communities');
                                        }}
                                        className="group p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gradient-to-br hover:from-orange-50 hover:to-amber-50 dark:hover:from-gray-700 dark:hover:to-gray-700/80 cursor-pointer transition-all"
                                    >
                                        <div className="flex gap-3">
                                            <div className="text-2xl text-orange-600 dark:text-orange-400 flex-shrink-0">
                                                <FaUsers />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900 dark:text-white text-base group-hover:text-orange-600 transition-colors">Meydan</h3>
                                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Topluluklara katıl, sohbete başla.</p>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>

                            {/* Footer - Google Play */}
                            <div className="border-t border-gray-200 dark:border-gray-700 px-6 sm:px-8 py-5 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/70 dark:to-gray-800 shrink-0">
                                <div className="flex justify-center">
                                    <a href="https://play.google.com/store/apps/details?id=com.herkeslersoruyor.mobile" target="_blank" rel="noopener noreferrer" className="px-3.5 py-2 bg-gradient-to-r from-gray-900 to-gray-800 text-white text-xs font-bold rounded-lg hover:shadow-lg hover:from-gray-800 hover:to-gray-900 transition-all flex items-center gap-2 whitespace-nowrap">
                                        <FaGooglePlay className="text-sm" /> Google Play
                                    </a>
                                </div>
                            </div>
                        </div>

                        {/* Right Side - Categories List (30-35%) - Desktop Only */}
                        <div className="hidden lg:flex lg:w-1/3 flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
                            {/* Categories Header */}
                            <div className="sticky top-0 border-b border-gray-200 dark:border-gray-700 px-5 py-3 bg-gray-50 dark:bg-gray-900">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-bold text-gray-900 dark:text-white">
                                        Konular <span className="text-coral">({categories.length})</span>
                                    </h3>
                                    <Link to="/questions" onClick={() => setIsQuestionsModalOpen(false)} className="text-coral font-semibold text-sm hover:underline">
                                        Tümü
                                    </Link>
                                </div>
                            </div>

                            {/* Categories List */}
                            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5">
                                {loadingCategories ? (
                                    <div className="flex justify-center items-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-coral border-t-transparent"></div>
                                    </div>
                                ) : (
                                    categories.map((cat) => (
                                        <button
                                            key={cat.id}
                                            onClick={() => handleCategorySelect(cat.slug)}
                                            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition-all group"
                                        >
                                            {/* Category Icon/Color */}
                                            <div 
                                                style={{ backgroundColor: cat.color || '#6B7280' }}
                                                className="w-8 h-8 rounded-md flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                                            >
                                                {cat.name.charAt(0)}
                                            </div>
                                            {/* Category Name */}
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-coral transition-colors truncate">
                                                {cat.name}
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Ask Modal */}
            {showQuickAskModal && (
                <QuickAskModal onClose={() => setShowQuickAskModal(false)} />
            )}
        </>
    );
};

export default Header;

