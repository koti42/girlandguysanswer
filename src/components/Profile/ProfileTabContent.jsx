import React from 'react';
import { FaUserSecret, FaInbox, FaTrophy, FaComment, FaHeart, FaMedal, FaMars, FaVenus } from 'react-icons/fa';
import ProfileStats from '../ProfileStats';
import QuestionCard from '../QuestionCard';
import AnswerCard from '../AnswerCard';
import FollowersList from '../FollowersList';
import { getThemeStyles, getViewerPrefs } from '../../utils/userColor';

const TabSkeleton = ({ type, contentCreator, viewerPrefs }) => {
    const themeStyles = contentCreator ? getThemeStyles(contentCreator, viewerPrefs) : null;
    const pulseAccentStyle = themeStyles ? { backgroundColor: themeStyles.bgColorStrong } : {};
    const pulseAccentClass = !themeStyles ? 'bg-gray-100 dark:bg-gray-700' : '';
    const pulseLight = 'bg-gray-200 dark:bg-gray-700';

    if (type === 'answers') {
        return (
            <div className="flex flex-col gap-4 animate-pulse">
                {/* Stats skeleton */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                    <div className="grid grid-cols-3 gap-4">
                        {[...Array(3)].map((_, i) => (
                            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${pulseAccentClass}`} style={pulseAccentStyle}>
                                <div className={`w-10 h-10 rounded-xl ${pulseLight}`}></div>
                                <div className="flex-1">
                                    <div className={`h-5 w-10 ${pulseLight} rounded mb-1.5`}></div>
                                    <div className={`h-3 w-16 ${pulseLight} rounded`}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                {/* Card skeletons */}
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                        <div className={`${pulseAccentClass} rounded-xl p-4 mb-4`} style={pulseAccentStyle}>
                            <div className={`h-3 w-12 ${pulseLight} rounded mb-2`}></div>
                            <div className={`h-4 w-3/4 ${pulseLight} rounded mb-2`}></div>
                            <div className={`h-4 w-1/2 ${pulseLight} rounded`}></div>
                        </div>
                        <div className="space-y-2 mb-4">
                            <div className={`h-3.5 w-full ${pulseLight} rounded`}></div>
                            <div className={`h-3.5 w-5/6 ${pulseLight} rounded`}></div>
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/50">
                            <div className="flex items-center gap-3">
                                <div className={`h-7 w-16 ${pulseLight} rounded-full`}></div>
                                <div className={`h-7 w-20 ${pulseLight} rounded-full`}></div>
                            </div>
                            <div className={`h-3 w-16 ${pulseLight} rounded`}></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'questions') {
        return (
            <div className="flex flex-col gap-6 animate-pulse">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`w-10 h-10 rounded-full ${pulseLight}`}></div>
                            <div className="flex-1">
                                <div className={`h-3.5 w-24 ${pulseLight} rounded mb-1.5`}></div>
                                <div className={`h-3 w-16 ${pulseLight} rounded`}></div>
                            </div>
                        </div>
                        <div className={`h-5 w-4/5 ${pulseLight} rounded mb-2`}></div>
                        <div className={`h-4 w-full ${pulseLight} rounded mb-2`}></div>
                        <div className={`h-4 w-2/3 ${pulseLight} rounded mb-4`}></div>
                        <div className="flex items-center gap-4 pt-3 border-t border-gray-100 dark:border-gray-700/50">
                            <div className={`h-3 w-12 ${pulseLight} rounded`}></div>
                            <div className={`h-3 w-12 ${pulseLight} rounded`}></div>
                            <div className={`h-3 w-12 ${pulseLight} rounded`}></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'followers' || type === 'following') {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 animate-pulse">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                        <div className={`w-11 h-11 rounded-full ${pulseLight}`}></div>
                        <div className="flex-1">
                            <div className={`h-3.5 w-28 ${pulseLight} rounded mb-1.5`}></div>
                            <div className={`h-3 w-20 ${pulseLight} rounded`}></div>
                        </div>
                        <div className={`h-8 w-20 ${pulseLight} rounded-lg`}></div>
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'badges') {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-full ${pulseLight}`}></div>
                        <div className="flex-1">
                            <div className={`h-4 w-24 ${pulseLight} rounded mb-2`}></div>
                            <div className={`h-3 w-32 ${pulseLight} rounded`}></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
};

const ProfileTabContent = ({ activeTab, profileData, userQuestions, answers, followers, following, loading, isOwnProfile, isVIP, viewerPrefs }) => {

    const contentCreator = { gender: profileData?.gender };
    const themeStyles = getThemeStyles(contentCreator, viewerPrefs);

    if (loading) {
        return <TabSkeleton type={activeTab} contentCreator={contentCreator} viewerPrefs={viewerPrefs} />;
    }

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

    if (activeTab === 'answers') {
        const totalAnswers = answers.length;
        const acceptedAnswers = answers.filter(a => a.is_accepted).length;
        const totalLikes = answers.reduce((sum, a) => sum + (a.likes_count || 0), 0);

        const statCardStyle = { backgroundColor: themeStyles.bgColor, borderColor: `${themeStyles.accentColor}40` };
        const statIconStyle = { backgroundColor: themeStyles.bgColorStrong, color: themeStyles.accentColor };
        const emptyIconStyle = { backgroundColor: themeStyles.bgColor };

        return (
            <>
                {/* Answer Stats Summary */}
                {totalAnswers > 0 && (
                    <div className="relative overflow-hidden rounded-2xl shadow-soft">
                        <div className="absolute inset-0 opacity-[0.07]" style={{ background: `linear-gradient(to right, ${themeStyles.accentColor}, ${themeStyles.accentColor}aa)` }}></div>
                        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-5 border border-gray-100 dark:border-gray-700 rounded-2xl">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="flex items-center gap-3 p-3 rounded-xl border" style={statCardStyle}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={statIconStyle}>
                                        <FaComment className="text-sm" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{totalAnswers}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Toplam Cevap</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl border" style={statCardStyle}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500">
                                        <FaMedal className="text-sm" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{acceptedAnswers}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">En İyi Seçilen</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 rounded-xl border" style={statCardStyle}>
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={statIconStyle}>
                                        <FaHeart className="text-sm" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-gray-900 dark:text-white">{totalLikes}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Toplam Beğeni</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Answers List */}
                {totalAnswers > 0 ? (
                    <div className="flex flex-col gap-4">
                        {answers.map(answer => (
                            <AnswerCard key={answer.id} answer={answer} profileGender={gender} profileUser={{ gender }} profileGender={gender} />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-soft border border-gray-100 dark:border-gray-700">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4" style={emptyIconStyle}>
                            <FaComment className="text-3xl" style={{ color: themeStyles.accentColor }} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">Henüz cevap yok</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Bu kullanıcı henüz hiç cevap vermemiş.</p>
                    </div>
                )}
            </>
        );
    }

    if (activeTab === 'followers') {
        return <FollowersList followers={followers} type="followers" isOwnProfile={isOwnProfile} />;
    }

    if (activeTab === 'following') {
        return <FollowersList followers={following} type="following" isOwnProfile={isOwnProfile} />;
    }

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
