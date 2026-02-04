import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { statsAPI } from '../services/adminApi';
import {
    FaUsers,
    FaBan,
    FaSnowflake,
    FaQuestionCircle,
    FaComments,
    FaReply,
    FaExclamationTriangle,
    FaClock,
    FaChartLine,
    FaArrowUp,
    FaArrowRight,
    FaEdit,
    FaEye,
    FaUserShield,
    FaCheckCircle,
    FaTimesCircle,
} from 'react-icons/fa';

const DashboardPage = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const response = await statsAPI.getOverview();
            setStats(response.data.data);
        } catch (err) {
            setError('İstatistikler yüklenirken bir hata oluştu.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[500px]">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-coral/20 animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-900/10 border border-red-200 dark:border-red-800/50 rounded-3xl p-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <FaExclamationTriangle className="text-red-500 text-2xl" />
                </div>
                <h3 className="text-lg font-bold text-red-700 dark:text-red-400 mb-2">Bir Hata Oluştu</h3>
                <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
                <button
                    onClick={fetchStats}
                    className="px-6 py-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-medium"
                >
                    Tekrar Dene
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Hoş geldiniz! İşte sistem genel görünümü</p>
                </div>
                <button
                    onClick={fetchStats}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md"
                >
                    <FaChartLine />
                    <span>Yenile</span>
                </button>
            </div>

            {/* User Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Total Users */}
                <div className="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                <FaUsers className="text-white text-xl" />
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                    {(stats?.users?.total || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Toplam Kullanıcı</p>
                        <Link to="/cpl-manage/users" className="mt-3 inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 font-medium">
                            Görüntüle <FaArrowRight className="text-xs" />
                        </Link>
                    </div>
                </div>

                {/* Banned Users */}
                <div className="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                                <FaBan className="text-white text-xl" />
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                    {(stats?.users?.banned || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Yasaklı Kullanıcı</p>
                        <Link to="/cpl-manage/users?banned=true" className="mt-3 inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-600 font-medium">
                            Görüntüle <FaArrowRight className="text-xs" />
                        </Link>
                    </div>
                </div>

                {/* Frozen Users */}
                <div className="group relative bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl p-6 border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
                                <FaSnowflake className="text-white text-xl" />
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                                    {(stats?.users?.frozen || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Dondurulmuş Hesap</p>
                        <Link to="/cpl-manage/users?frozen=true" className="mt-3 inline-flex items-center gap-1 text-sm text-purple-500 hover:text-purple-600 font-medium">
                            Görüntüle <FaArrowRight className="text-xs" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Complaints Alert */}
            {(stats?.complaints?.pending || 0) > 0 && (
                <Link
                    to="/cpl-manage/complaints"
                    className="group block relative bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 backdrop-blur-xl border-2 border-amber-500/30 rounded-3xl p-6 hover:border-amber-500/50 transition-all duration-300 overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex items-center justify-between">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
                                <FaClock className="text-white text-2xl" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {stats?.complaints?.pending} Bekleyen Şikayet
                                </p>
                                <p className="text-gray-600 dark:text-gray-400 mt-1">
                                    Acil inceleme gerektiren şikayetler var
                                </p>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-xl font-medium shadow-lg shadow-amber-500/30 group-hover:shadow-xl group-hover:shadow-amber-500/40 transition-all">
                            <span>İncele</span>
                            <FaArrowRight />
                        </div>
                    </div>
                </Link>
            )}

            {/* Content Stats */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-200/50 dark:border-gray-700/50">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">İçerik İstatistikleri</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Platform içerik özeti</p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4">
                    {/* Questions */}
                    <Link to="/cpl-manage/questions" className="group p-6 border-r border-b lg:border-b-0 border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                <FaQuestionCircle className="text-orange-500" />
                            </div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Sorular</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {(stats?.content?.questions_total || 0).toLocaleString()}
                        </p>
                        {(stats?.content?.questions_today || 0) > 0 && (
                            <div className="flex items-center gap-1 mt-2 text-sm text-green-500">
                                <FaArrowUp className="text-xs" />
                                <span>+{stats?.content?.questions_today} bugün</span>
                            </div>
                        )}
                    </Link>

                    {/* Opinions */}
                    <Link to="/cpl-manage/opinions" className="group p-6 border-b lg:border-b-0 lg:border-r border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                <FaEdit className="text-green-500" />
                            </div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Görüşler</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {(stats?.content?.opinions_total || 0).toLocaleString()}
                        </p>
                        {(stats?.content?.opinions_today || 0) > 0 && (
                            <div className="flex items-center gap-1 mt-2 text-sm text-green-500">
                                <FaArrowUp className="text-xs" />
                                <span>+{stats?.content?.opinions_today} bugün</span>
                            </div>
                        )}
                    </Link>

                    {/* Answers */}
                    <Link to="/cpl-manage/answers" className="group p-6 border-r border-gray-200/50 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                <FaReply className="text-blue-500" />
                            </div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Cevaplar</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {(stats?.content?.answers_total || 0).toLocaleString()}
                        </p>
                        {(stats?.content?.answers_today || 0) > 0 && (
                            <div className="flex items-center gap-1 mt-2 text-sm text-green-500">
                                <FaArrowUp className="text-xs" />
                                <span>+{stats?.content?.answers_today} bugün</span>
                            </div>
                        )}
                    </Link>

                    {/* Comments */}
                    <Link to="/cpl-manage/comments" className="group p-6 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <FaComments className="text-purple-500" />
                            </div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Yorumlar</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {(stats?.content?.comments_total || 0).toLocaleString()}
                        </p>
                    </Link>
                </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-3xl border border-gray-200/50 dark:border-gray-700/50 shadow-sm p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Hızlı İşlemler</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                    {[
                        { to: '/cpl-manage/complaints', icon: FaExclamationTriangle, label: 'Şikayetler', color: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/20' },
                        { to: '/cpl-manage/users', icon: FaUsers, label: 'Kullanıcılar', color: 'from-blue-500 to-cyan-500', shadow: 'shadow-blue-500/20' },
                        { to: '/cpl-manage/questions', icon: FaQuestionCircle, label: 'Sorular', color: 'from-orange-500 to-red-500', shadow: 'shadow-orange-500/20' },
                        { to: '/cpl-manage/opinions', icon: FaEdit, label: 'Görüşler', color: 'from-green-500 to-emerald-500', shadow: 'shadow-green-500/20' },
                        { to: '/cpl-manage/answers', icon: FaReply, label: 'Cevaplar', color: 'from-indigo-500 to-purple-500', shadow: 'shadow-indigo-500/20' },
                        { to: '/cpl-manage/roles', icon: FaUserShield, label: 'Roller', color: 'from-pink-500 to-rose-500', shadow: 'shadow-pink-500/20' },
                    ].map((item, index) => (
                        <Link
                            key={index}
                            to={item.to}
                            className={`group flex flex-col items-center gap-3 p-5 rounded-2xl bg-gradient-to-br ${item.color} shadow-lg ${item.shadow} hover:shadow-xl hover:scale-105 transition-all duration-300`}
                        >
                            <item.icon className="text-white text-2xl" />
                            <span className="text-white font-semibold text-sm">{item.label}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DashboardPage;
