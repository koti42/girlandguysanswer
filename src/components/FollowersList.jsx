import React from 'react';
import { Link } from 'react-router-dom';
import { FaUserPlus, FaCheck } from 'react-icons/fa';

const FollowersList = ({ followers, type = 'followers' }) => {
    return (
        <div className="space-y-4">
            {followers.map(user => (
                <div key={user.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-start gap-4">
                        <Link to={`/profile/${user.username}`}>
                            <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-14 h-14 rounded-full border-2 border-gray-100 hover:border-coral transition-colors"
                            />
                        </Link>

                        <div className="flex-1">
                            <Link to={`/profile/${user.username}`} className="hover:underline">
                                <h3 className="font-bold text-gray-800">{user.name}</h3>
                                <p className="text-gray-500 text-sm">@{user.username}</p>
                            </Link>
                            <p className="text-gray-600 text-sm mt-1">{user.bio}</p>
                        </div>

                        {type === 'followers' ? (
                            user.isFollowing ? (
                                <button className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-xl hover:bg-gray-200 transition-all">
                                    <FaCheck /> Takipte
                                </button>
                            ) : (
                                <button className="flex items-center gap-2 bg-coral text-white font-semibold py-2 px-4 rounded-xl hover:scale-105 transition-all shadow-md">
                                    <FaUserPlus /> Takip Et
                                </button>
                            )
                        ) : (
                            <button className="bg-red-50 text-red-600 font-semibold py-2 px-4 rounded-xl hover:bg-red-100 transition-all">
                                Takibi Bırak
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default FollowersList;
