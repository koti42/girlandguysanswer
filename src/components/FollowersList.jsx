import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { FaUserPlus, FaCheck, FaUserFriends } from 'react-icons/fa';
import { usersAPI } from '../services/api';
import Toast from './Toast';

const FollowersList = ({ followers: initialFollowers, type = 'followers' }) => {
    const [followers, setFollowers] = useState(initialFollowers);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, toastType = 'success') => {
        setToast({ show: true, message, type: toastType });
    };

    const handleFollow = async (user) => {
        try {
            await usersAPI.follow(user.username);

            // Update local state
            setFollowers(prev => prev.map(u =>
                u.id === user.id ? { ...u, isFollowing: true } : u
            ));

            showToast(`${user.username} takip edildi!`, 'success');
        } catch (error) {
            const errorMsg = error.response?.data?.message || 'Takip işlemi başarısız oldu.';
            showToast(errorMsg, 'error');
        }
    };

    const handleUnfollow = async (user) => {
        try {
            await usersAPI.unfollow(user.username);

            if (type === 'following') {
                // Remove from following list
                setFollowers(prev => prev.filter(u => u.id !== user.id));
            } else {
                // Update isFollowing status in followers list
                setFollowers(prev => prev.map(u =>
                    u.id === user.id ? { ...u, isFollowing: false } : u
                ));
            }

            showToast(`${user.username} takipten çıkarıldı.`, 'success');
        } catch (error) {
            const errorMsg = error.response?.data?.message || 'Takipten çıkma işlemi başarısız oldu.';
            showToast(errorMsg, 'error');
        }
    };

    if (followers.length === 0) {
        return (
            <div className="bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 p-16 text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-coral/20 to-pink-100 dark:from-coral/10 dark:to-pink-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FaUserFriends className="text-5xl text-coral dark:text-coral-light" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">
                    {type === 'followers' ? 'Henüz takipçi yok' : 'Henüz kimseyi takip etmiyor'}
                </h3>
                <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                    {type === 'followers'
                        ? 'Bu kullanıcının henüz takipçisi bulunmuyor.'
                        : 'Bu kullanıcı henüz kimseyi takip etmiyor.'}
                </p>
            </div>
        );
    }

    return (
        <>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {followers.map(user => (
                    <div
                        key={user.id}
                        className="group bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-2xl p-5 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 hover:border-coral/30 dark:hover:border-coral/30 hover:scale-[1.02]"
                    >
                        <div className="flex items-start gap-4">
                            <Link to={`/profile/${user.username}`} className="flex-shrink-0">
                                <div className="relative">
                                    <UserAvatar
                                        user={user}
                                        size="xl"
                                        className="ring-2 ring-gray-100 dark:ring-gray-700 group-hover:ring-coral/50 transition-all"
                                    />
                                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
                                </div>
                            </Link>

                            <div className="flex-1 min-w-0">
                                <Link to={`/profile/${user.username}`} className="block group/name">
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-white truncate group-hover/name:text-coral transition-colors">
                                        {user.name || user.username}
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm truncate">@{user.username}</p>
                                </Link>
                                {user.bio && (
                                    <p className="text-gray-600 dark:text-gray-400 text-sm mt-2 line-clamp-2">
                                        {user.bio}
                                    </p>
                                )}

                                <div className="mt-3">
                                    {type === 'followers' ? (
                                        user.isFollowing ? (
                                            <button
                                                onClick={() => handleUnfollow(user)}
                                                className="flex items-center gap-2 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-2.5 px-5 rounded-xl hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-500 transition-all shadow-sm hover:shadow-md"
                                            >
                                                <FaCheck className="text-green-600 dark:text-green-400" /> Takiptesin
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => handleFollow(user)}
                                                className="flex items-center gap-2 bg-gradient-to-r from-coral to-pink-500 text-white font-semibold py-2.5 px-5 rounded-xl hover:from-coral-dark hover:to-pink-600 transition-all shadow-md hover:shadow-lg hover:scale-105"
                                            >
                                                <FaUserPlus /> Takip Et
                                            </button>
                                        )
                                    ) : (
                                        <button
                                            onClick={() => handleUnfollow(user)}
                                            className="bg-gradient-to-r from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 text-red-600 dark:text-red-400 font-semibold py-2.5 px-5 rounded-xl hover:from-red-100 hover:to-red-200 dark:hover:from-red-900/30 dark:hover:to-red-800/30 transition-all shadow-sm hover:shadow-md"
                                        >
                                            Takibi Bırak
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
};

export default FollowersList;
