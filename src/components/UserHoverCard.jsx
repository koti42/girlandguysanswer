import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaEnvelope, FaUserPlus, FaUserMinus, FaBan, FaCheckCircle } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import { usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { notificationToast } from '../utils/notificationToast';

const HOVER_DELAY_MS = 400;
const LEAVE_DELAY_MS = 200;

const ensureHttps = (url) => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `https://${url}`;
};

const UserHoverCard = ({ username, categoryName, categoryColor, user: initialUser, children }) => {
    const { user: currentUser } = useAuth();
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isFollowing, setIsFollowing] = useState(!!initialUser?.isFollowing);
    const [hasBlocked, setHasBlocked] = useState(!!initialUser?.hasBlocked);
    const [actionLoading, setActionLoading] = useState(false);
    const showTimerRef = useRef(null);
    const hideTimerRef = useRef(null);
    const containerRef = useRef(null);

    const clearShowTimer = () => {
        if (showTimerRef.current) {
            clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }
    };

    const clearHideTimer = () => {
        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
        }
    };

    const fetchProfile = async () => {
        if (!username || username === 'anonim') return;
        setLoading(true);
        try {
            const res = await usersAPI.getProfile(username);
            const responseData = res.data?.data || res.data;
            const data = responseData?.user || responseData;
            if (data) {
                setProfile(data);
                if (data.is_following !== undefined) setIsFollowing(data.is_following);
                if (data.isFollowing !== undefined) setIsFollowing(data.isFollowing);
                if (data.has_blocked !== undefined) setHasBlocked(data.has_blocked);
                if (data.hasBlocked !== undefined) setHasBlocked(data.hasBlocked);
            }
        } catch (err) {
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    const handleMouseEnter = () => {
        clearHideTimer();
        showTimerRef.current = setTimeout(() => {
            setVisible(true);
            fetchProfile();
        }, HOVER_DELAY_MS);
    };

    const handleMouseLeave = () => {
        clearShowTimer();
        hideTimerRef.current = setTimeout(() => setVisible(false), LEAVE_DELAY_MS);
    };

    useEffect(() => {
        return () => {
            clearShowTimer();
            clearHideTimer();
        };
    }, []);

    const handleFollow = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUser || actionLoading) return;
        if (currentUser.username === username) return;
        setActionLoading(true);
        try {
            if (isFollowing) {
                await usersAPI.unfollow(username);
                setIsFollowing(false);
                notificationToast.success('Takipten çıkıldı.');
            } else {
                await usersAPI.follow(username);
                setIsFollowing(true);
                notificationToast.success('Takip edildi.');
            }
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleBlock = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!currentUser || actionLoading) return;
        if (currentUser.username === username) return;
        setActionLoading(true);
        try {
            if (hasBlocked) {
                await usersAPI.unblock(username);
                setHasBlocked(false);
                setVisible(false);
                notificationToast.success('Engel kaldırıldı.');
            } else {
                await usersAPI.block(username);
                setHasBlocked(true);
                setVisible(false);
                notificationToast.success('Kullanıcı engellendi.');
            }
        } catch (err) {
            notificationToast.error(err.response?.data?.message || 'İşlem başarısız.');
        } finally {
            setActionLoading(false);
        }
    };

    const handleMessage = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setVisible(false);
        navigate(`/messages/${username}`);
    };

    if (!username || username === 'anonim') {
        return <>{children}</>;
    }

    const displayProfile = profile || initialUser;
    const stats = displayProfile?.stats || {};
    const followers = stats.followers ?? displayProfile?.followers_count ?? 0;
    const following = stats.following ?? displayProfile?.following_count ?? 0;
    const ageRange = displayProfile?.age_range;
    const level = displayProfile?.level;
    const levelName = typeof level === 'object' ? level?.name : level;
    const levelColor = typeof level === 'object' ? level?.color : '#6B7280';
    const badgesCount = (displayProfile?.badges || [])?.length ?? stats.badges ?? 0;
    const xp = displayProfile?.xp ?? stats.xperPoints ?? 0;
    const hexColor = categoryName ? getCategoryColor(categoryColor) : '#8B5CF6';
    const IconComponent = categoryName ? getCategoryIcon(categoryName) : null;

    return (
        <div
            ref={containerRef}
            className="relative inline-flex"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {visible && (
                <div
                    className="absolute left-0 top-full mt-2 z-[100] w-80 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                >
                    {/* Header Image/Gradient */}
                    <div
                        className="h-24 relative"
                        style={{ background: `linear-gradient(135deg, ${hexColor} 0%, ${hexColor}dd 100%)` }}
                    >
                        {categoryName && IconComponent && (
                            <div className="absolute top-3 right-3 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-semibold flex items-center gap-1.5 border border-white/10">
                                <IconComponent />
                                {categoryName}
                            </div>
                        )}
                    </div>

                    <div className="px-5 pb-5 relative">
                        {/* Avatar */}
                        <div className="absolute -top-12 left-5">
                            <div className="w-24 h-24 rounded-full border-[5px] border-white dark:border-gray-800 shadow-md overflow-hidden bg-white">
                                <UserAvatar
                                    user={{ avatar: ensureHttps(displayProfile?.avatar), username: displayProfile?.username || username }}
                                    size="2xl"
                                    className="w-full h-full"
                                />
                            </div>
                        </div>

                        {/* Top Actions */}
                        <div className="flex justify-end pt-3 mb-2 min-h-[40px]">
                            {currentUser && currentUser.username !== username && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={handleMessage}
                                        className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-700 text-gray-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-500 transition-all border border-gray-200 dark:border-gray-600"
                                        title="Mesaj gönder"
                                    >
                                        <FaEnvelope className="text-sm" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleBlock}
                                        disabled={actionLoading}
                                        className={`w-9 h-9 flex items-center justify-center rounded-full bg-gray-50 dark:bg-gray-700 text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-500 transition-all border border-gray-200 dark:border-gray-600 ${hasBlocked ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : ''}`}
                                        title={hasBlocked ? 'Engeli kaldır' : 'Engelle'}
                                    >
                                        <FaBan className="text-sm" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* User Info */}
                        <div className="mt-2 mb-4">
                            <Link
                                to={`/profile/${username}`}
                                className="block group"
                                onClick={() => setVisible(false)}
                            >
                                <h3 className="font-bold text-gray-900 dark:text-white text-xl group-hover:text-coral transition-colors flex items-center gap-2">
                                    {displayProfile?.username || username}
                                    {displayProfile?.is_verified && <FaCheckCircle className="text-blue-500 text-sm" />}
                                </h3>
                                {(ageRange || levelName) && (
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {ageRange && (
                                            <span className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                                Yaş: {ageRange}
                                            </span>
                                        )}
                                        {levelName && (
                                            <span
                                                className="inline-flex text-xs font-semibold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                                                style={levelColor ? { color: levelColor, backgroundColor: `${levelColor}20` } : {}}
                                            >
                                                {levelName}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </Link>
                        </div>

                        {loading ? (
                            <div className="py-6 flex items-center justify-center text-gray-400 text-sm">
                                <span className="animate-pulse">Profil yükleniyor...</span>
                            </div>
                        ) : (
                            <>
                                {/* Stats Grid */}
                                <div className="grid grid-cols-3 gap-2 mb-5">
                                    <div className="text-center p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <div className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{followers}</div>
                                        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Takipçi</div>
                                    </div>
                                    <div className="text-center p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <div className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{following}</div>
                                        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Takip</div>
                                    </div>
                                    <div className="text-center p-2 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                        <div className="font-bold text-coral text-lg leading-tight">{xp}</div>
                                        <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Uzmanlık Puanı</div>
                                    </div>
                                </div>

                                {/* Main Action */}
                                {currentUser && currentUser.username !== username && (
                                    <button
                                        type="button"
                                        onClick={handleFollow}
                                        disabled={actionLoading}
                                        className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 ${isFollowing
                                            ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                            : 'bg-black dark:bg-white text-white dark:text-black hover:opacity-90'
                                            }`}
                                    >
                                        {isFollowing ? (
                                            <>
                                                <FaUserMinus className="text-xs opacity-70" />
                                                Takibi Bırak
                                            </>
                                        ) : (
                                            <>
                                                <FaUserPlus className="text-xs opacity-70" />
                                                Takip Et
                                            </>
                                        )}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UserHoverCard;
