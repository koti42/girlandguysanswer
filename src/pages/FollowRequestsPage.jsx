import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FaUserPlus, FaCheck, FaTimes, FaUserFriends } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';
import UserAvatar from '../components/UserAvatar';
import { usersAPI } from '../services/api';
import Toast from '../components/Toast';

const FollowRequestsPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [processingIds, setProcessingIds] = useState(new Set());
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    useEffect(() => {
        fetchFollowRequests();
    }, []);

    const fetchFollowRequests = async () => {
        setLoading(true);
        try {
            const response = await usersAPI.getFollowRequests();
            setRequests(response.data.data.requests || response.data.data || []);
        } catch {
            showToast('Takip istekleri yüklenemedi', 'error');
        } finally {
            setLoading(false);
        }
    };

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
    };

    const handleAccept = async (request) => {
        setProcessingIds(prev => new Set(prev).add(request.id));

        try {
            await usersAPI.acceptFollowRequest(request.id);
            setRequests(prev => prev.filter(r => r.id !== request.id));
            const username = request.requester?.username || request.user?.username || 'Kullanıcı';
            showToast(`${username} artık sizi takip ediyor`, 'success');
        } catch {
            showToast('İstek kabul edilemedi', 'error');
        } finally {
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(request.id);
                return newSet;
            });
        }
    };

    const handleReject = async (request) => {
        setProcessingIds(prev => new Set(prev).add(request.id));

        try {
            await usersAPI.rejectFollowRequest(request.id);
            setRequests(prev => prev.filter(r => r.id !== request.id));
            showToast('Takip isteği reddedildi', 'success');
        } catch {
            showToast('İstek reddedilemedi', 'error');
        } finally {
            setProcessingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(request.id);
                return newSet;
            });
        }
    };

    return (
        <>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}

            <MainLayout sidebar={<><TrendsWidget /><TopUsersWidget /></>}>
                <div className="max-w-2xl mx-auto">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 mb-6 backdrop-blur-sm">
                        <div className="flex items-center gap-4">
                            <div className="relative p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
                                <FaUserPlus className="text-2xl text-white" />
                                {requests.length > 0 && (
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                                        {requests.length > 9 ? '9+' : requests.length}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1">
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                                    Takip İstekleri
                                </h1>
                                {requests.length > 0 ? (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                        {requests.length} kişi sizi takip etmek istiyor
                                    </p>
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        Bekleyen istek yok
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Requests List */}
                    {loading ? (
                        <div className="flex justify-center p-10">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-16 text-center">
                            <div className="relative w-24 h-24 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                                <FaUserFriends className="text-5xl text-gray-400 dark:text-gray-500" />
                                <div className="absolute inset-0 rounded-full border-4 border-dashed border-gray-200 dark:border-gray-600 animate-spin" style={{ animationDuration: '3s' }}></div>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                                ✨ Bekleyen İstek Yok
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                                Şu anda takip isteği bulunmuyor. Hesabınız gizli olduğu için takip istekleri önce onayınızı bekliyor.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {requests.map(request => {
                                const isProcessing = processingIds.has(request.id);
                                const user = request.requester || request.user || request.follower || {};

                                if (!user || !user.username) {
                                    return null;
                                }

                                return (
                                    <div
                                        key={request.id}
                                        className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md hover:border-purple-200 dark:hover:border-purple-700 transition-all overflow-hidden"
                                    >
                                        <div className="p-5">
                                            <div className="flex items-center gap-4">
                                                <Link to={`/profile/${user.username}`} className="flex-shrink-0">
                                                    <UserAvatar
                                                        user={user}
                                                        size="lg"
                                                        className="w-14 h-14 hover:ring-2 hover:ring-purple-400 transition-all"
                                                    />
                                                </Link>

                                                <div className="flex-1 min-w-0">
                                                    <Link
                                                        to={`/profile/${user.username}`}
                                                        className="group"
                                                    >
                                                        <h3 className="font-semibold text-gray-900 dark:text-white text-base group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                                            {user.name || user.username}
                                                        </h3>
                                                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                                                            @{user.username}
                                                        </p>
                                                    </Link>

                                                    {user.bio && (
                                                        <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 line-clamp-2">
                                                            {user.bio}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => handleAccept(request)}
                                                    disabled={isProcessing}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md active:scale-95"
                                                >
                                                    {isProcessing ? (
                                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                                    ) : (
                                                        <FaCheck className="text-sm" />
                                                    )}
                                                    <span>Kabul Et</span>
                                                </button>

                                                <button
                                                    onClick={() => handleReject(request)}
                                                    disabled={isProcessing}
                                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-gray-200 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                                                >
                                                    {isProcessing ? (
                                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent"></div>
                                                    ) : (
                                                        <FaTimes className="text-sm" />
                                                    )}
                                                    <span>Reddet</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </MainLayout>
        </>
    );
};

export default FollowRequestsPage;
