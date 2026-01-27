import React from 'react';
import { FaUserSecret, FaInbox } from 'react-icons/fa';
import ProfileStats from '../ProfileStats';
import QuestionCard from '../QuestionCard';
import AnswerCard from '../AnswerCard';
import FollowersList from '../FollowersList';

const ProfileTabContent = ({ activeTab, profileData, userQuestions, answers, followers, following, loading, isOwnProfile, isVIP }) => {

    // Privacy Check for Content
    if (profileData.isPrivate && !profileData.isFollowing && !isOwnProfile) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center shadow-soft border border-gray-100 dark:border-gray-700">
                <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FaUserSecret className="text-4xl text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Bu Hesap Gizli</h3>
                <p className="text-gray-500 dark:text-gray-400">
                    Bu kullanıcının paylaşımlarını görmek için takip etmelisin.
                </p>
            </div>
        );
    }

    // Questions Tab
    if (activeTab === 'questions') {
        return (
            <>
                <ProfileStats stats={profileData.stats} isVIP={isVIP} />

                {profileData.about && (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">Hakkımda</h2>
                        <p className="text-gray-700 dark:text-gray-300">{profileData.about}</p>
                    </div>
                )}

                {userQuestions.length > 0 ? (
                    <div className="flex flex-col gap-6">
                        {userQuestions.map(question => (
                            <QuestionCard key={question.id} question={question} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl shadow-soft">
                        <FaInbox className="text-4xl text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">Henüz hiç soru sormamış.</p>
                    </div>
                )}
            </>
        );
    }

    // Answers Tab
    if (activeTab === 'answers') {
        return (
            <>
                {answers.length > 0 ? (
                    <div className="flex flex-col gap-6">
                        {answers.map(answer => (
                            <AnswerCard key={answer.id} answer={answer} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl shadow-soft">
                        <FaInbox className="text-4xl text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">Henüz hiç cevap vermemiş.</p>
                    </div>
                )}
            </>
        );
    }

    // Followers Tab
    if (activeTab === 'followers') {
        return <FollowersList followers={followers} type="followers" isOwnProfile={isOwnProfile} />;
    }

    // Following Tab
    if (activeTab === 'following') {
        return <FollowersList followers={following} type="following" isOwnProfile={isOwnProfile} />;
    }

    // Badges Tab
    if (activeTab === 'badges') {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {profileData.badges && profileData.badges.length > 0 ? (
                    profileData.badges.map((badge, index) => (
                        <div key={index} className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-soft border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                            {badge.icon_url ? (
                                <img src={badge.icon_url} alt={badge.name} className="w-16 h-16 object-contain" />
                            ) : (
                                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                                    <span className="text-2xl">🏅</span>
                                </div>
                            )}
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">{badge.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{badge.description}</p>
                                <span className="text-xs text-coral mt-1 block">{badge.awarded_at ? new Date(badge.awarded_at).toLocaleDateString() : ''}</span>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="col-span-full text-center py-10 bg-white dark:bg-gray-800 rounded-2xl shadow-soft">
                        <FaTrophy className="text-4xl text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400">Henüz hiç rozet kazanmamış.</p>
                    </div>
                )}
            </div>
        );
    }

    // Liked Tab (Placeholder as per previous implementation logic)
    if (activeTab === 'liked') {
        return (
            <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl shadow-soft">
                <FaInbox className="text-4xl text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-gray-400">Beğenilen içerik yok.</p>
            </div>
        );
    }

    return null;
};

export default ProfileTabContent;
