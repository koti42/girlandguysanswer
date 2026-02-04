import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { FaArrowUp, FaArrowDown, FaMinus, FaMedal, FaBullhorn } from 'react-icons/fa';
import { tagsAPI, gamificationAPI } from '../services/api';

export const TrendsWidget = () => {
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPopular = async () => {
            try {
                const response = await tagsAPI.getPopular({ limit: 6, period_days: 14 });
                const data = response.data?.data;
                setTags(data?.tags || []);
            } catch (err) {
                console.error('Trend etiketler yüklenirken hata:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchPopular();
    }, []);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-coral rounded-full"></span>
                    Trendler
                </h3>
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-coral border-t-transparent"></div>
                </div>
            </div>
        );
    }

    if (tags.length === 0) return null;

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-coral rounded-full"></span>
                Trendler
            </h3>
            <div className="flex flex-col gap-3">
                {tags.map((item, idx) => (
                    <Link
                        key={idx}
                        to={`/questions?search=${encodeURIComponent(item.tag)}`}
                        className="flex items-center justify-between group"
                    >
                        <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium group-hover:bg-coral/10 group-hover:text-coral transition-colors flex-1 truncate">
                            #{item.tag}
                        </span>
                        <div className="flex items-center gap-1.5 text-gray-400 text-xs flex-shrink-0 ml-2">
                            {item.trend === 'up' && <FaArrowUp className="text-green-500" title="Yükseliş" />}
                            {item.trend === 'down' && <FaArrowDown className="text-red-500" title="Düşüş" />}
                            {item.trend === 'same' && <FaMinus className="text-gray-400" title="Değişmedi" />}
                            <span>{item.count}</span>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
};

export const TopUsersWidget = () => {
    const [topUsers, setTopUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTopUsers = async () => {
            try {
                const response = await gamificationAPI.getLeaderboard({ limit: 3, type: 'general' });
                // API returns: { success: true, data: { leaderboard: [...], pagination: {...} } }
                if (response.data.success) {
                    setTopUsers(response.data.data.leaderboard || []);
                }
            } catch (error) {
                console.error("Top users loading error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchTopUsers();
    }, []);

    if (loading) return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft h-[200px] flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
        </div>
    );

    if (topUsers.length === 0) return null;

    // Helper to render user block
    const renderUser = (entry, index, sizeClasses, borderColors) => {
        if (!entry) return null; // Handle if fewer than 3 users
        const user = entry.user;
        return (
            <div className={`flex flex-col items-center gap-2 relative ${index === 0 ? '-mt-4' : ''}`}>
                <Link to={`/profile/${user.username}`}>
                    <UserAvatar user={user} size="xl" className={`${sizeClasses} ${borderColors}`} />
                </Link>
                <div className="text-center">
                    <Link to={`/profile/${user.username}`} className="block text-sm font-bold text-gray-800 dark:text-white hover:underline truncate max-w-[80px]">
                        {user.username}
                    </Link>
                    <span className="text-[10px] text-gray-500">{Math.floor(entry.xp || 0)} XP</span>
                </div>
                {index === 0 && <FaMedal className="text-gold text-3xl absolute -top-4 right-0" />}
                {index === 1 && <FaMedal className="text-gray-400 text-xl absolute -top-3 right-0" />}
                {index === 2 && <FaMedal className="text-orange-400 text-xl absolute -top-3 right-0" />}
            </div>
        );
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-soft">
            <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                <span className="w-1 h-6 bg-gold rounded-full"></span>
                Topluluk Liderleri
            </h3>
            <div className="flex justify-around items-end">
                {/* 2nd Place */}
                {renderUser(topUsers[1], 1, "w-14 h-14", "border-2 border-gray-300")}

                {/* 1st Place */}
                {renderUser(topUsers[0], 0, "w-20 h-20", "border-4 border-gold shadow-md")}

                {/* 3rd Place */}
                {renderUser(topUsers[2], 2, "w-14 h-14", "border-2 border-orange-300")}
            </div>
            <div className="mt-6 text-center">
                <Link to="/leaderboard" className="text-sm font-semibold text-coral hover:underline">
                    Tüm Sıralamayı Gör
                </Link>
            </div>
        </div>
    );
};

export const AnnouncementsWidget = () => (
    <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl p-6 shadow-none border border-gray-200">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-gray-700">
            <FaBullhorn className="text-coral" />
            Duyurular
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            Binlerce soru yanıtını bekliyor! Sen de aramıza katıl, puanları topla fenomen ol.
        </p>
    </div>
);
