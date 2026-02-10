import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { FaArrowUp, FaArrowDown, FaMinus, FaMedal, FaBullhorn, FaFire, FaChevronRight } from 'react-icons/fa';
import { tagsAPI, gamificationAPI, questionsAPI } from '../services/api';

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
                    Gündem
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
                Gündem
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
                Üstatlar
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
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2 text-gray-700 dark:text-gray-100">
            <FaBullhorn className="text-coral" />
            Duyurular
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
            Binlerce soru yanıtını bekliyor! Sen de aramıza katıl, puanları topla fenomen ol.
        </p>
    </div>
);

export const PopularQuestionsWidget = () => {
    const [popularQuestions, setPopularQuestions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPopularQuestions = async () => {
            try {
                const response = await questionsAPI.getAll({
                    sort: 'popular',
                    limit: 5,
                });
                const data = response.data?.data;
                setPopularQuestions(data?.questions || data || []);
            } catch (error) {
                console.error('Popüler sorular yüklenirken hata:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchPopularQuestions();
    }, []);

    if (!loading && popularQuestions.length === 0) return null;

    return (
        <div className="mt-4 bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-soft border border-gray-200 dark:border-gray-700 sticky top-24">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-coral/10 text-coral">
                        <FaFire className="text-sm" />
                    </span>
                    <div>
                        <h3 className="font-bold text-sm text-gray-800 dark:text-gray-100">
                            Popüler Sorular
                        </h3>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Şu an topluluğun en çok konuştuğu konular
                        </p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-coral border-t-transparent" />
                </div>
            ) : (
                <ul className="flex flex-col gap-2">
                    {popularQuestions.slice(0, 5).map((q, index) => (
                        <li key={q.id}>
                            <Link
                                to={`/question/${q.slug}`}
                                className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-gray-50 via-white to-gray-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-3 py-2 flex items-start gap-3 hover:shadow-md hover:from-coral/5 hover:to-orange-100/10 dark:hover:from-coral/15 dark:hover:to-orange-500/10 border border-gray-100 dark:border-gray-700 transition-all"
                            >
                                <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-coral text-[10px] font-bold text-white flex-shrink-0 shadow-sm">
                                    #{index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-100 group-hover:text-coral line-clamp-2">
                                        {q.title}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                                        {q.category?.name && (
                                            <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] font-medium text-gray-600 dark:text-gray-300">
                                                {q.category.name}
                                            </span>
                                        )}
                                        {typeof q.answer_count === 'number' && q.answer_count > 0 && (
                                            <span>
                                                {q.answer_count} cevap
                                            </span>
                                        )}
                                        {typeof q.view_count === 'number' && q.view_count > 0 && (
                                            <span>
                                                · {q.view_count} görüntüleme
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <FaChevronRight className="mt-0.5 text-xs text-gray-300 group-hover:text-coral flex-shrink-0" />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
