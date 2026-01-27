import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaUserSlash } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import ProfileCover from '../components/ProfileCover';
import ProfileAvatar from '../components/ProfileAvatar';
import { useAuth } from '../context/AuthContext';
import { usersAPI, questionsAPI } from '../services/api';
import Toast from '../components/Toast';
import ErrorPage from './ErrorPage';

import BlockedUserView from '../components/Profile/BlockedUserView';
import ProfileHeaderInfo from '../components/Profile/ProfileHeaderInfo';
import ProfileActions from '../components/Profile/ProfileActions';
import ProfileTabs from '../components/Profile/ProfileTabs';
import ProfileTabContent from '../components/Profile/ProfileTabContent';

const ProfilePage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user: currentUser, updateUser } = useAuth();
    const isOwnProfile = !username || (currentUser && currentUser.username === username);

    const DEFAULT_COVER = 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop';
    const DEFAULT_AVATAR = 'https://i.pravatar.cc/200?u=default';

    const [isVIP, setIsVIP] = useState(false);

    const ensureHttps = (url) => {
        if (!url) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        return `https://${url}`;
    };

    const [activeTab, setActiveTab] = useState('questions');
    const [isEditing, setIsEditing] = useState(false);

    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const actionsMenuRef = useRef(null);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [showUnblockModal, setShowUnblockModal] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target)) {
                setShowActionsMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const [loading, setLoading] = useState(true);
    const [tabLoading, setTabLoading] = useState(false);
    const [profileData, setProfileData] = useState(null);
    const [userQuestions, setUserQuestions] = useState([]);
    const [followers, setFollowers] = useState([]);
    const [following, setFollowing] = useState([]);
    const [answers, setAnswers] = useState([]);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
    };
    const [editForm, setEditForm] = useState({ name: '', bio: '', location: '' });

    useEffect(() => {
        const fetchProfileData = async () => {
            if (!profileData || (profileData.username !== (username || currentUser?.username))) {
                setLoading(true);
            }
            try {
                let data;
                let questionsData = [];
                let questionsCount = null;
                let answersCount = null;

                if (isOwnProfile) {
                    const response = await usersAPI.getProfile(username || currentUser.username);
                    data = response.data.data;
                    const qResponse = await questionsAPI.getMyQuestions();
                    questionsCount = qResponse.data?.data?.count ?? qResponse.data?.data?.questions?.length ?? null;
                    questionsData = qResponse.data.data.questions.map(q => ({
                        ...q,
                        user: q.user || {
                            id: data.id,
                            username: data.username,
                            name: data.name || data.username,
                            avatar: data.avatar,
                            gender: data.gender
                        }
                    }));
                } else {
                    const response = await usersAPI.getProfile(username);
                    data = response.data.data;

                    questionsData = (data.questions || []).map(q => ({
                        ...q,
                        user: q.user || {
                            id: data.id,
                            username: data.username,
                            name: data.name || data.username,
                            avatar: data.avatar,
                            gender: data.gender
                        }
                    }));
                    questionsCount = data.questions_count ?? data.stats?.questions ?? (data.questions?.length ?? null);
                }

                setIsVIP(data.username === 'theerriss');

                // Answers count: fetch once on profile load so tab counter is correct before clicking.
                const canViewAnswers = isOwnProfile || !data.isPrivate || data.isFollowing;
                if (canViewAnswers) {
                    try {
                        const aRes = await usersAPI.getUserAnswers(data.username);
                        answersCount = aRes.data?.data?.count ?? aRes.data?.data?.answers?.length ?? null;
                    } catch (e) {
                        answersCount = null;
                    }
                }

                setProfileData({
                    ...data,
                    name: data.username,
                    coverPhoto: ensureHttps(data.coverImage) || DEFAULT_COVER,
                    avatar: ensureHttps(data.avatar) || DEFAULT_AVATAR,
                    location: data.location || 'Konum belirtilmedi',
                    joinedDate: new Date(data.created_at || Date.now()).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
                    badges: data.badges || [],
                    level: data.level || { name: 'Yeni Üye', color: '#999' },
                    xp: data.xp || 0,
                    ranks: data.ranks || { general: '-', gender: '-' },
                    isFollowing: data.isFollowing || false,
                    hasPendingRequest: data.hasPendingRequest || false,
                    isPrivate: data.isPrivate || false,
                    allow_following: data.allow_following !== undefined ? data.allow_following : true,
                    allow_messaging: data.allow_messaging !== undefined ? data.allow_messaging : true,
                    messaging_mode: data.messaging_mode || 'everyone',
                    hasBlocked: data.hasBlocked || false,
                    isBlocked: data.isBlocked || false,
                    stats: {
                        questions: (questionsCount ?? data.stats?.questions ?? 0),
                        followers: data.stats?.followers || 0,
                        following: data.stats?.following || 0,
                        answers: (answersCount ?? data.stats?.answers ?? 0),
                        likes: data.stats?.likes || 0,
                        badges: data.badges?.length || 0,
                        xperPoints: data.xp || 0,
                        generalRank: data.ranks?.general || '-',
                        categoryRank: data.ranks?.gender || '-'
                    }
                });
                setUserQuestions(questionsData);

                if (isOwnProfile) {
                    setEditForm({
                        name: data.username || '',
                        bio: data.bio || '',
                        location: data.location || '',
                    });
                }
            } catch (error) {
                console.error('Profile load error', error);
            } finally {
                setLoading(false);
            }
        };

        if (username || currentUser) {
            fetchProfileData();
        }
    }, [username, currentUser, isOwnProfile]);

    useEffect(() => {
        const fetchTabData = async () => {
            if (!profileData || !profileData.username) return;

            setTabLoading(true);
            try {
                if (activeTab === 'followers') {
                    const res = await usersAPI.getFollowers(profileData.username);
                    const items = res.data.data.followers || (Array.isArray(res.data.data) ? res.data.data : []);
                    setFollowers(items);
                } else if (activeTab === 'following') {
                    const res = await usersAPI.getFollowing(profileData.username);
                    const items = res.data.data.following || (Array.isArray(res.data.data) ? res.data.data : []);
                    setFollowing(items);
                } else if (activeTab === 'answers') {
                    const canViewAnswers = isOwnProfile || !profileData.isPrivate || profileData.isFollowing;
                    if (canViewAnswers) {
                        const res = await usersAPI.getUserAnswers(profileData.username);
                        setAnswers(res.data.data.answers || res.data.data || []);
                    } else {
                        setAnswers([]);
                    }
                }
            } catch (error) {
                if (activeTab === 'followers') setFollowers([]);
                if (activeTab === 'following') setFollowing([]);
                if (activeTab === 'answers') setAnswers([]);
            } finally {
                setTabLoading(false);
            }
        };

        fetchTabData();
    }, [activeTab, profileData, isOwnProfile]);

    if (loading) return <MainLayout><div className="flex justify-center p-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div></div></MainLayout>;

    if (!profileData) return (
        <ErrorPage
            code={404}
            title="Kullanıcı Bulunamadı"
            message="Böyle bir profil yok veya silinmiş olabilir. Kullanıcı adını kontrol edip tekrar deneyebilirsin."
            icon={FaUserSlash}
        />
    );

    const handleAvatarUpload = async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await usersAPI.uploadAvatar(formData);
            if ((response.data.status === 'success' || response.data.success)) {
                const newAvatarUrl = ensureHttps(response.data.data.avatar_url);

                if (newAvatarUrl) {
                    setProfileData(prev => ({ ...prev, avatar: newAvatarUrl }));

                    if (currentUser && (currentUser.username === profileData.username || isOwnProfile)) {
                        updateUser({ avatar: newAvatarUrl });
                    }
                    showToast('Profil fotoğrafı güncellendi.', 'success');
                }
            }
        } catch (error) {
            showToast('Profil fotoğrafı güncellenemedi.', 'error');
        }
    };

    const handleAvatarRemove = async () => {
        try {
            await usersAPI.deleteAvatar();
            setProfileData(prev => ({ ...prev, avatar: DEFAULT_AVATAR }));
            if (currentUser && (currentUser.username === profileData.username || isOwnProfile)) {
                updateUser({ avatar: DEFAULT_AVATAR });
            }
            showToast('Profil fotoğrafı kaldırıldı.', 'success');
        } catch (error) {
            showToast('Profil fotoğrafı kaldırılamadı.', 'error');
        }
    };

    const handleCoverUpload = async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await usersAPI.uploadCoverImage(formData);
            if ((response.data.status === 'success' || response.data.success)) {
                const newCoverUrl = ensureHttps(response.data.data.cover_image_url || response.data.data.cover_url);

                if (newCoverUrl) {
                    setProfileData(prev => ({ ...prev, coverPhoto: newCoverUrl }));

                    if (currentUser && (currentUser.username === profileData.username || isOwnProfile)) {
                        updateUser({ cover_image: newCoverUrl });
                    }
                    showToast('Kapak fotoğrafı güncellendi.', 'success');
                }
            }
        } catch (error) {
            showToast('Kapak fotoğrafı güncellenemedi.', 'error');
        }
    };

    const handleCoverRemove = async () => {
        try {
            await usersAPI.deleteCoverImage();
            setProfileData(prev => ({ ...prev, coverPhoto: DEFAULT_COVER }));
            if (currentUser && (currentUser.username === profileData.username || isOwnProfile)) {
                updateUser({ cover_image: DEFAULT_COVER });
            }
            showToast('Kapak fotoğrafı kaldırıldı.', 'success');
        } catch (error) {
            showToast('Kapak fotoğrafı kaldırılamadı.', 'error');
        }
    };

    const handleFollowToggle = async () => {
        if (!profileData) return;

        if (profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest) {
            showToast('Bu kullanıcı takip edilmeyi kapatmış.', 'warning');
            return;
        }

        try {
            if (profileData.isFollowing) {
                await usersAPI.unfollow(profileData.username);
                setProfileData(prev => ({
                    ...prev,
                    isFollowing: false,
                    hasPendingRequest: false,
                    stats: { ...prev.stats, followers: Math.max(0, (prev.stats?.followers || 0) - 1) }
                }));
                showToast('Takipten çıkıldı.', 'success');
            } else if (profileData.hasPendingRequest) {
                await usersAPI.unfollow(profileData.username);
                setProfileData(prev => ({ ...prev, hasPendingRequest: false }));
                showToast('Takip isteği iptal edildi.', 'success');
            } else {
                const res = await usersAPI.follow(profileData.username);
                const isRequest = res.data.data?.type === 'request';

                setProfileData(prev => ({
                    ...prev,
                    isFollowing: !isRequest,
                    hasPendingRequest: isRequest,
                    stats: !isRequest ? { ...prev.stats, followers: (prev.stats?.followers || 0) + 1 } : prev.stats
                }));
                showToast(isRequest ? 'Takip isteği gönderildi.' : 'Takip edildi.', 'success');
            }
        } catch (error) {
            const backendMessage = error.response?.data?.message;
            if (backendMessage) {
                showToast(backendMessage, 'error');
            } else if (error.response?.status === 403) {
                showToast('Bu kullanıcı takip edilmeyi kapatmış veya sizi engellemiş.', 'error');
            } else {
                showToast('Takip işlemi başarısız oldu.', 'error');
            }
        }
    };

    const handleBlockToggle = () => setShowBlockModal(true);

    const confirmBlock = async () => {
        try {
            await usersAPI.block(profileData.username);
            setShowBlockModal(false);
            setProfileData(prev => ({
                ...prev,
                hasBlocked: true,
                isFollowing: false,
                hasPendingRequest: false,
                stats: {
                    ...prev.stats,
                    followers: prev.isFollowing ? Math.max(0, (prev.stats?.followers || 0) - 1) : (prev.stats?.followers || 0)
                }
            }));
            showToast('Kullanıcı engellendi.', 'success');
        } catch (error) {
            setShowBlockModal(false);
            showToast('Engelleme işlemi başarısız oldu.', 'error');
        }
    };

    const handleUnblock = () => setShowUnblockModal(true);

    const confirmUnblock = async () => {
        try {
            await usersAPI.unblock(profileData.username);
            setShowUnblockModal(false);
            // Refresh profile to get original state
            const response = await usersAPI.getProfile(profileData.username);
            const data = response.data.data;
            setProfileData(prev => ({ ...prev, ...data, hasBlocked: false, isBlocked: false }));
            showToast('Engel başarıyla kaldırıldı.', 'success');
        } catch (error) {
            setShowUnblockModal(false);
            showToast('Engel kaldırma işlemi başarısız oldu.', 'error');
        }
    };

    const handleSave = () => {
        setProfileData(prev => ({ ...prev, ...editForm }));
        setIsEditing(false);
    };

    const gender = profileData.gender;
    const isFemale = gender === 'female' || gender === 'kiz' || gender === 'kadın' || gender === 'woman';
    const isMale = gender === 'male' || gender === 'erkek' || gender === 'man';

    const headerShellClasses = isFemale
        ? 'bg-gradient-to-br from-pink-50 via-rose-50 to-fuchsia-50 dark:from-pink-900/20 dark:via-rose-900/10 dark:to-fuchsia-900/20 border border-pink-100 dark:border-pink-800'
        : isMale
            ? 'bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50 dark:from-sky-900/20 dark:via-blue-900/10 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800'
            : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700';

    return (
        <>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}

            <MainLayout sidebar={null}>
                <div className="flex flex-col gap-6">
                    {/* Blocked View */}
                    <BlockedUserView
                        type={!isOwnProfile && profileData.isBlocked ? 'blocked_by' : !isOwnProfile && profileData.hasBlocked ? 'has_blocked' : null}
                        username={profileData.username}
                        onUnblock={handleUnblock}
                        onBack={() => navigate(-1)}
                    />

                    {/* Normal Profile content only if NOT blocked */}
                    {!(!isOwnProfile && (profileData.isBlocked || profileData.hasBlocked)) && (
                        <>
                            {/* Profile Header */}
                            <div className={`${headerShellClasses} rounded-2xl shadow-soft overflow-hidden`}>
                                <ProfileCover
                                    coverPhoto={profileData.coverPhoto}
                                    onCoverUpload={isOwnProfile ? handleCoverUpload : null}
                                    onCoverRemove={isOwnProfile ? handleCoverRemove : null}
                                />

                                <div className="p-6">
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <ProfileAvatar
                                            avatar={profileData.avatar}
                                            username={profileData.username}
                                            onAvatarUpload={isOwnProfile ? handleAvatarUpload : null}
                                            onAvatarRemove={isOwnProfile ? handleAvatarRemove : null}
                                        />

                                        {isEditing ? (
                                            <div className="flex-1 space-y-3">
                                                <input
                                                    type="text"
                                                    value={editForm.name}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                    placeholder="İsim"
                                                />
                                                <textarea
                                                    value={editForm.bio}
                                                    onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                                                    rows={3}
                                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                                    placeholder="Hakkında"
                                                />
                                                <div className="flex gap-2">
                                                    <button onClick={handleSave} className="bg-coral text-white px-4 py-2 rounded-lg">Kaydet</button>
                                                    <button onClick={() => setIsEditing(false)} className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg dark:text-gray-300">İptal</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <ProfileHeaderInfo
                                                profileData={profileData}
                                                isVIP={isVIP}
                                                gender={gender}
                                            />
                                        )}

                                        {!isEditing && (
                                            <div className="flex gap-2 mt-4 md:mt-0">
                                                <ProfileActions
                                                    profileData={profileData}
                                                    isOwnProfile={isOwnProfile}
                                                    isVIP={isVIP}
                                                    onEdit={() => setIsEditing(true)}
                                                    onFollowToggle={handleFollowToggle}
                                                    onBlockToggle={handleBlockToggle}
                                                    onUnblock={handleUnblock}
                                                    showActionsMenu={showActionsMenu}
                                                    setShowActionsMenu={setShowActionsMenu}
                                                    actionsMenuRef={actionsMenuRef}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {!isEditing && (
                                        <ProfileTabs
                                            activeTab={activeTab}
                                            setActiveTab={setActiveTab}
                                            stats={profileData.stats}
                                            isVIP={isVIP}
                                            privacy={{ isPrivate: profileData.isPrivate, isFollowing: profileData.isFollowing }}
                                            isOwnProfile={isOwnProfile}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="flex flex-col gap-6">
                                <ProfileTabContent
                                    activeTab={activeTab}
                                    profileData={profileData}
                                    userQuestions={userQuestions}
                                    answers={answers}
                                    followers={followers}
                                    following={following}
                                    loading={tabLoading}
                                    isOwnProfile={isOwnProfile}
                                    isVIP={isVIP}
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Modals */}
                {showBlockModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full">
                            <h3 className="text-xl font-bold mb-4 dark:text-white">Emin misiniz?</h3>
                            <p className="text-gray-600 dark:text-gray-300 mb-6">Bu kullanıcıyı engellemek istediğinize emin misiniz?</p>
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => setShowBlockModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300">İptal</button>
                                <button onClick={confirmBlock} className="px-4 py-2 bg-red-500 text-white rounded-lg">Engelle</button>
                            </div>
                        </div>
                    </div>
                )}

                {showUnblockModal && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-sm w-full">
                            <h3 className="text-xl font-bold mb-4 dark:text-white">Engeli Kaldır</h3>
                            <p className="text-gray-600 dark:text-gray-300 mb-6">Bu kullanıcının engelini kaldırmak istediğinize emin misiniz?</p>
                            <div className="flex gap-3 justify-end">
                                <button onClick={() => setShowUnblockModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300">İptal</button>
                                <button onClick={confirmUnblock} className="px-4 py-2 bg-green-500 text-white rounded-lg">Kaldır</button>
                            </div>
                        </div>
                    </div>
                )}
            </MainLayout>
        </>
    );
};

export default ProfilePage;
