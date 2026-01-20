import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import UserAvatar from './UserAvatar';
import { FaUserPlus, FaCheck } from 'react-icons/fa';
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

    return (
        <>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}
            
            <div className="space-y-4">
                {followers.map(user => (
                    <div key={user.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-start gap-4">
                            <Link to={`/profile/${user.username}`}>
                                <UserAvatar
                                    user={user}
                                    size="lg"
                                    className="w-14 h-14 hover:border-coral transition-colors"
                                />
                            </Link>

                            <div className="flex-1">
                                <Link to={`/profile/${user.username}`} className="hover:underline">
                                    <h3 className="font-bold text-gray-800 dark:text-white">{user.name || user.username}</h3>
                                    <p className="text-gray-500 text-sm">@{user.username}</p>
                                </Link>
                                {user.bio && <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{user.bio}</p>}
                            </div>

                            {type === 'followers' ? (
                                user.isFollowing ? (
                                    <button 
                                        onClick={() => handleUnfollow(user)}
                                        className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold py-2 px-4 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                                    >
                                        <FaCheck /> Takipte
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => handleFollow(user)}
                                        className="flex items-center gap-2 bg-coral text-white font-semibold py-2 px-4 rounded-xl hover:scale-105 transition-all shadow-md"
                                    >
                                        <FaUserPlus /> Takip Et
                                    </button>
                                )
                            ) : (
                                <button 
                                    onClick={() => handleUnfollow(user)}
                                    className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold py-2 px-4 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
                                >
                                    Takibi Bırak
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
};

export default FollowersList;
