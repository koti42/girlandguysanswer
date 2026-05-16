import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { gamificationAPI } from '../services/api';
import { FaTrophy, FaMedal, FaCrown } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import UserAvatar from '../components/UserAvatar';

const LeaderboardPage = () => {
    const [activeTab, setActiveTab] = useState('general');
    const [loading, setLoading] = useState(true);
    const [leaderboard, setLeaderboard] = useState([]);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setLoading(true);
            try {
                const typeMap = {
                    general: 'general',
                    female: 'female',
                    male: 'male'
                };
                const response = await gamificationAPI.getLeaderboard({
                    type: typeMap[activeTab],
                    limit: 20
                });

                const data = response.data?.data?.leaderboard || response.data?.leaderboard || [];
                setLeaderboard(data);
            } catch (error) {
                console.error('Leaderboard fetch error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, [activeTab]);

    const getRankIcon = (rank) => {
        switch (rank) {
            case 1: return <FaCrown className="text-yellow-500 text-2xl animate-bounce-slow" />;
            case 2: return <FaMedal className="text-gray-400 text-2xl" />;
            case 3: return <FaMedal className="text-amber-700 text-2xl" />;
            default: return <span className="text-lg font-bold text-gray-400">#{rank}</span>;
        }
    };

    const getRowStyle = (rank) => {
        if (rank === 1) return 'bg-gradient-to-r from-yellow-50 to-white dark:from-yellow-900/20 dark:to-gray-800 border-l-4 border-yellow-400';
        if (rank === 2) return 'bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800 border-l-4 border-gray-300';
        if (rank === 3) return 'bg-gradient-to-r from-orange-50 to-white dark:from-orange-900/20 dark:to-gray-800 border-l-4 border-orange-400';
        return 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50';
    };

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        Üstatlar 🏆
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Topluluğun en aktif ve sevilen üyeleri
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex justify-center mb-8">
                    <div className="bg-white dark:bg-gray-800 p-1.5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 inline-flex gap-1">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`px-6 py-2.5 rounded-xl font-semibold transition-all ${activeTab === 'general'
                                ? 'bg-gradient-to-r from-coral to-orange-400 text-white shadow-md'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                        >
                            Genel
                        </button>
                        <button
                            onClick={() => setActiveTab('female')}
                            className={`px-6 py-2.5 rounded-xl font-semibold transition-all ${activeTab === 'female'
                                ? 'bg-gradient-to-r from-pink-500 to-rose-400 text-white shadow-md'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                        >
                            Kadınlar
                        </button>
                        <button
                            onClick={() => setActiveTab('male')}
                            className={`px-6 py-2.5 rounded-xl font-semibold transition-all ${activeTab === 'male'
                                ? 'bg-gradient-to-r from-blue-500 to-cyan-400 text-white shadow-md'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                }`}
                        >
                            Erkekler
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="flex flex-col gap-3">
                    {loading ? (
                        <div className="flex flex-col gap-3">
                            {[1, 2, 3, 4, 5].map(i => (
                                <div key={i} className="h-20 bg-white dark:bg-gray-800 rounded-2xl animate-pulse"></div>
                            ))}
                        </div>
                    ) : leaderboard.length > 0 ? (
                        leaderboard.map((item, index) => (
                            <Link
                                to={`/profile/${item.user?.username}`}
                                key={item.user?.id || index}
                                className={`flex items-center p-4 rounded-2xl shadow-soft transition-all transform hover:scale-[1.01] ${getRowStyle(item.rank || index + 1)}`}
                            >
                                {/* Rank */}
                                <div className="w-12 md:w-16 flex justify-center shrink-0">
                                    {getRankIcon(item.rank || index + 1)}
                                </div>

                                {/* User Info */}
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="relative">
                                        <UserAvatar
                                            user={item.user}
                                            size="lg"
                                            className={`w-12 h-12 md:w-14 md:h-14 border-2 ${(item.rank || index + 1) === 1 ? 'border-yellow-400' :
                                                (item.rank || index + 1) === 2 ? 'border-gray-300' :
                                                    (item.rank || index + 1) === 3 ? 'border-orange-400' : 'border-transparent'
                                                }`}
                                        />
                                        {(item.rank || index + 1) === 1 && (
                                            <div className="absolute -top-2 -right-2 bg-yellow-400 text-white text-[10px] px-1.5 py-0.5 rounded-full shadow-lg font-bold">
                                                #1
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                            {item.user?.username}
                                            {item.level && (
                                                <span
                                                    className="text-[10px] px-2 py-0.5 rounded-full text-white font-medium hidden sm:inline-block"
                                                    style={{ backgroundColor: item.level.color || '#999' }}
                                                >
                                                    {item.level.name || item.level}
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {item.user?.name || item.user?.username}
                                        </p>
                                    </div>
                                </div>

                                {/* XP Stats */}
                                <div className="text-right px-2 md:px-4">
                                    <div className="text-lg md:text-xl font-black text-coral">
                                        {item.xp?.toLocaleString()} <span className="text-xs font-medium text-gray-400">Uzmanlık</span>
                                    </div>
                                </div>
                            </Link>
                        ))
                    ) : (
                        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
                            <FaTrophy className="text-6xl text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-400">Henüz Sıralama Yok</h3>
                            <p className="text-gray-400 mt-2">Bu kategoride henüz yeterli veri oluşmadı.</p>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default LeaderboardPage;
