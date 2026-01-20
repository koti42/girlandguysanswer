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
        } catch (error) {
            console.error('Takip istekleri yüklenemedi:', error);
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
            showToast(`${request.user.username} artık sizi takip ediyor`, 'success');
        } catch (error) {
            console.error('İstek kabul edilemedi:', error);
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
        } catch (error) {
            console.error('İstek reddedilemedi:', error);
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
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                                <FaUserPlus className="text-2xl text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                                    Takip İstekleri
                                </h1>
                                {requests.length > 0 && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                        {requests.length} bekleyen istek
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
                        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-12 text-center">
                            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FaUserFriends className="text-4xl text-gray-400" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-2">
                                Bekleyen İstek Yok
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400">
                                Yeni takip istekleri burada görünecek.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {requests.map(request => {
                                const isProcessing = processingIds.has(request.id);

                                return (
                                    <div
                                        key={request.id}
                                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 hover:shadow-md transition-all"
                                    >
                                        <div className="flex items-start gap-4">
                                            <Link to={`/profile/${request.user.username}`}>
                                                <UserAvatar
                                                    user={request.user}
                                                    size="lg"
                                                    className="w-16 h-16 hover:border-coral transition-colors"
                                                />
                                            </Link>

                                            <div className="flex-1 min-w-0">
                                                <Link
                                                    to={`/profile/${request.user.username}`}
                                                    className="hover:underline"
                                                >
                                                    <h3 className="font-bold text-gray-800 dark:text-white text-lg">
                                                        {request.user.username}
                                                    </h3>
                                                </Link>

                                                {request.user.bio && (
                                                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-1 line-clamp-2">
                                                        {request.user.bio}
                                                    </p>
                                                )}

                                                <div className="flex gap-3 mt-4">
                                                    <button
                                                        onClick={() => handleAccept(request)}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                                                    >
                                                        {isProcessing ? (
                                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                        ) : (
                                                            <FaCheck />
                                                        )}
                                                        Kabul Et
                                                    </button>

                                                    <button
                                                        onClick={() => handleReject(request)}
                                                        disabled={isProcessing}
                                                        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
                                                    >
                                                        {isProcessing ? (
                                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                                        ) : (
                                                            <FaTimes />
                                                        )}
                                                        Reddet
                                                    </button>
                                                </div>
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
