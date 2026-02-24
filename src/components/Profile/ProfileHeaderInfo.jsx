import React from 'react';
import { FaCrown, FaStar, FaMapMarkerAlt, FaCalendarAlt, FaTrophy } from 'react-icons/fa';
import ProfileBadges from '../ProfileBadges';

const ProfileHeaderInfo = ({ profileData, isVIP, gender }) => {
    const isFemale = gender === 'female' || gender === 'kiz' || gender === 'kadın' || gender === 'woman';
    const isMale = gender === 'male' || gender === 'erkek' || gender === 'man';

    return (
        <div className="flex-1">
            <div className="flex items-center gap-2">
                <h1 className={`text-2xl font-bold ${isVIP
                    ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 bg-clip-text text-transparent animate-shimmer'
                    : 'text-gray-800 dark:text-white'
                    }`}>
                    {profileData.name}
                </h1>
                {isVIP && (
                    <div className="relative inline-flex items-center">
                        <FaCrown className="text-amber-500 text-2xl animate-bounce-slow" />
                        <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping"></span>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1">
                <p className="text-gray-500 dark:text-gray-400">@{profileData.username}</p>

                {/* Admin / Super Admin Badge */}
                {profileData.roles && Array.isArray(profileData.roles) && profileData.roles.length > 0 && (
                    <>
                        {profileData.roles.includes('super_admin') && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm border border-white/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                                Super Admin
                            </span>
                        )}
                        {!profileData.roles.includes('super_admin') && profileData.roles.includes('admin') && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gradient-to-r from-sky-600 to-cyan-500 text-white shadow-sm border border-white/10">
                                <span className="w-1.5 h-1.5 rounded-full bg-lime-300 animate-pulse" />
                                Admin
                            </span>
                        )}
                    </>
                )}

                {/* Online Status Badge */}
                {profileData.is_online !== undefined && (
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${profileData.is_online
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${profileData.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                        {profileData.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}
                    </span>
                )}

                {/* Level Badge */}
                {profileData.level && (
                    <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: profileData.level.color || '#999' }}
                    >
                        <FaStar className="text-[10px]" />
                        <span>{profileData.level.name || profileData.level}</span>
                    </div>
                )}

                {/* Gender & Rank Badge */}
                {gender && (
                    <span
                        className={`px-3 py-1 text-[11px] font-semibold rounded-full shadow-sm border flex items-center gap-1 ${isFemale
                            ? 'bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-900/40 dark:text-pink-200 dark:border-pink-700'
                            : isMale
                                ? 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700'
                                : 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
                            }`}
                    >
                        {isFemale ? 'Kadın Profil' : isMale ? 'Erkek Profil' : 'Profil'}
                        {profileData.ranks?.gender && profileData.ranks.gender > 0 && (
                            <span className="ml-1 pl-1 border-l border-current opacity-80">
                                #{profileData.ranks.gender}
                            </span>
                        )}
                    </span>
                )}

                {/* General Rank Badge */}
                {profileData.ranks?.general && profileData.ranks.general > 0 && (
                    <span className="px-3 py-1 text-[11px] font-semibold rounded-full shadow-sm border bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1">
                        <FaTrophy className="text-xs" />
                        <span>Genel: #{profileData.ranks.general}</span>
                    </span>
                )}
                {isVIP && (
                    <span className="px-3 py-1 text-xs font-bold bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 text-white rounded-full shadow-lg animate-pulse-slow">
                        {isFemale ? '👑 Kraliçe' : '👑 Kral'}
                    </span>
                )}
            </div>


            <p className="text-gray-700 dark:text-gray-300 mt-3">{profileData.bio}</p>

            <div className="flex gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-1"><FaMapMarkerAlt />{profileData.location}</div>
                {profileData.joinedDate && (
                    <div className="flex items-center gap-1"><FaCalendarAlt />Katıldı {profileData.joinedDate}</div>
                )}
            </div>
        </div>
    );
};

export default ProfileHeaderInfo;
