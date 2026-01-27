import React from 'react';
import { Link } from 'react-router-dom';
import { FaEdit, FaEllipsisH, FaFlag, FaBan } from 'react-icons/fa';

const ProfileActions = ({
    profileData,
    isOwnProfile,
    isVIP,
    onEdit,
    onFollowToggle,
    onBlockToggle,
    onUnblock,
    showActionsMenu,
    setShowActionsMenu,
    actionsMenuRef
}) => {

    if (isOwnProfile) {
        // Edit button hidden temporarily as per request
        return null;
        /*
        return (
            <button
                onClick={onEdit}
                className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${isVIP
                    ? 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-lg hover:shadow-xl hover:scale-105 font-semibold'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300'
                    }`}
            >
                <FaEdit /> Düzenle
            </button>
        );
        */
    }

    return (
        <div className="flex items-center gap-2">
            {/* Message Button */}
            {profileData.allow_messaging &&
                (profileData.messaging_mode === 'everyone' ||
                    (profileData.messaging_mode === 'followers' && profileData.isFollowing)) && (
                    <Link to={`/messages/${profileData.username}`}>
                        <button className={`px-4 py-2 rounded-xl transition-all ${isVIP
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg hover:shadow-xl hover:scale-105 font-semibold'
                            : 'border-2 border-coral text-coral hover:bg-coral hover:text-white'
                            }`}>
                            Mesaj
                        </button>
                    </Link>
                )}

            {/* Follow Button */}
            <button
                onClick={onFollowToggle}
                disabled={profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest}
                className={`px-4 py-2 rounded-xl text-white transition-all shadow-md ${(profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest)
                    ? 'bg-gray-300 cursor-not-allowed'
                    : profileData.isFollowing
                        ? isVIP
                            ? 'bg-gradient-to-r from-gray-500 to-gray-600 hover:shadow-lg hover:scale-105'
                            : 'bg-gray-500 hover:bg-gray-600'
                        : profileData.hasPendingRequest
                            ? 'bg-yellow-500 hover:bg-yellow-600'
                            : isVIP
                                ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:shadow-xl hover:scale-105 font-semibold'
                                : 'bg-coral hover:bg-coral-dark'
                    }`}
                title={(profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest) ? 'Bu kullanıcı takip edilmeyi kapatmış' : ''}
            >
                {profileData.hasBlocked
                    ? 'Engellenmiş'
                    : profileData.isFollowing
                        ? 'Takip Ediliyor'
                        : profileData.hasPendingRequest
                            ? 'İstek Gönderildi'
                            : profileData.allow_following === false
                                ? 'Takip Kapalı'
                                : profileData.isPrivate
                                    ? 'Takip İsteği Gönder'
                                    : 'Takip Et'
                }
            </button>

            {/* More Options Menu */}
            <div className="relative" ref={actionsMenuRef}>
                <button
                    onClick={() => setShowActionsMenu(!showActionsMenu)}
                    className={`p-2 rounded-xl transition-all ${showActionsMenu
                        ? 'bg-gray-200 text-gray-800'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
                        }`}
                >
                    <FaEllipsisH />
                </button>

                {showActionsMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-20 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-1">
                            <button
                                onClick={() => {
                                    setShowActionsMenu(false);
                                    // Trigger report logic if passed or generic toast
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg flex items-center gap-2 transition-colors"
                            >
                                <FaFlag className="text-yellow-500" />
                                Şikayet Et
                            </button>
                            <button
                                onClick={() => {
                                    setShowActionsMenu(false);
                                    if (profileData.hasBlocked) {
                                        onUnblock();
                                    } else {
                                        onBlockToggle();
                                    }
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg flex items-center gap-2 transition-colors"
                            >
                                <FaBan />
                                {profileData.hasBlocked ? 'Engeli Kaldır' : 'Kullanıcıyı Engelle'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProfileActions;
