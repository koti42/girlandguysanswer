import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaUserSlash, FaExclamationTriangle } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import ProfileCover from '../components/ProfileCover';
import ProfileAvatar from '../components/ProfileAvatar';
import { useAuth } from '../context/AuthContext';
import { usersAPI, questionsAPI, opinionsAPI } from '../services/api';
import Toast from '../components/Toast';
import ErrorPage from './ErrorPage';

import BlockedUserView from '../components/Profile/BlockedUserView';
import ProfileHeaderInfo from '../components/Profile/ProfileHeaderInfo';
import ProfileActions from '../components/Profile/ProfileActions';
import ProfileTabs from '../components/Profile/ProfileTabs';
import ProfileTabContent from '../components/Profile/ProfileTabContent';
import ModerationActionsPanel from '../components/Moderation/ModerationActionsPanel';
import AccountStatusBanner from '../components/AccountStatusBanner';
import SEO from '../components/SEO';
import { getThemeStyles, getViewerPrefs } from '../utils/userColor';

const ProfilePage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user: currentUser, updateUser, permissions, canModerate } = useAuth();
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
    const [opinions, setOpinions] = useState([]);
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [featureTagSaving, setFeatureTagSaving] = useState(false);
    const [featureTagModalOpen, setFeatureTagModalOpen] = useState(false);
    const [featureTagDraft, setFeatureTagDraft] = useState('');

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
                    // Backend'den gelen response yapısı: { success: true, data: { user: {...}, ... } } veya { success: true, data: {...} }
                    const responseData = response.data.data;
                    data = responseData.user || responseData; // user objesi varsa onu kullan, yoksa direkt data'yı kullan

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
                    questionsCount = data.questions_count ?? data.question_count ?? data.stats?.questions ?? (data.questions?.length ?? null);
                }

                setIsVIP(data.username === 'theerriss');

                const canViewAnswers = isOwnProfile || !data.isPrivate || data.isFollowing;
                if (canViewAnswers) {
                    try {
                        const aRes = await usersAPI.getUserAnswers(data.username);
                        answersCount = aRes.data?.data?.count ?? aRes.data?.data?.answers?.length ?? null;
                    } catch (e) {
                        answersCount = null;
                    }
                }

                const createdDateValue = data.created_at || data.createdAt || data.created;
                
                const parseDate = (dateString) => {
                    if (!dateString) {
                        return null; // Tarih yoksa null döndür
                    }
                    
                    if (typeof dateString === 'string') {
                        const dateOnly = dateString.split('T')[0];
                        if (dateOnly && dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const [year, month, day] = dateOnly.split('-').map(Number);
                            if (year && month && day) {
                                return new Date(year, month - 1, day);
                            }
                        }
                    }
                    
                    if (dateString instanceof Date) {
                        return dateString;
                    }
                    
                    const date = new Date(dateString);
                    if (isNaN(date.getTime())) {
                        return null;
                    }
                    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
                };
                
                const joinedDate = parseDate(createdDateValue);
                const formattedDate = joinedDate ? joinedDate.toLocaleDateString('tr-TR', { 
                    month: 'long', 
                    year: 'numeric' 
                }) : null;
                
                setProfileData({
                    ...data,
                    name: data.username,
                    coverPhoto: ensureHttps(data.coverImage) || DEFAULT_COVER,
                    avatar: ensureHttps(data.avatar) || DEFAULT_AVATAR,
                    location: data.location || 'Konum belirtilmedi',
                    joinedDate: formattedDate,
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
                    accountStatus: data.accountStatus || null,
                    // Ban/Freeze durumları için backend'den gelen field'ları ekle
                    banned_at: data.banned_at || null,
                    banned_until: data.banned_until || null,
                    banned_reason: data.banned_reason || null,
                    frozen_at: data.frozen_at || null,
                    frozen_until: data.frozen_until || null,
                    frozen_reason: data.frozen_reason || null,
                    stats: {
                        questions: (questionsCount ?? data.stats?.questions ?? 0),
                        followers: data.stats?.followers || 0,
                        following: data.stats?.following || 0,
                        answers: (answersCount ?? data.stats?.answers ?? 0),
                        likes: data.stats?.likes || 0,
                        badges: (data.badges || [])?.length || 0,
                        xperPoints: data.xp || 0,
                        generalRank: (data.ranks || {})?.general || '-',
                        categoryRank: (data.ranks || {})?.gender || '-',
                        opinions: data.stats?.opinions ?? 0,
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
                } else if (activeTab === 'opinions') {
                    const res = await opinionsAPI.getAll({ page: 1, per_page: 15, user: profileData.username });
                    const data = res.data?.data;
                    const list = data?.opinions || (Array.isArray(data) ? data : (res.data?.opinions || []));
                    setOpinions(list);
                }
            } catch (error) {
                if (activeTab === 'followers') setFollowers([]);
                if (activeTab === 'following') setFollowing([]);
                if (activeTab === 'answers') setAnswers([]);
                if (activeTab === 'opinions') setOpinions([]);
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
    const contentCreator = { gender };
    const viewerPrefs = getViewerPrefs(currentUser);
    const themeStyles = getThemeStyles(contentCreator, viewerPrefs);

    const isCurrentUserSuperAdmin = !!permissions?.is_super_admin;

    const handleFeatureTagChange = async (slug) => {
        if (!profileData || !isCurrentUserSuperAdmin) return;
        const value = slug;
        setFeatureTagSaving(true);
        try {
            const res = await usersAPI.assignFeatureTag(profileData.id, value || null);
            const data = res.data?.data?.user || res.data?.user || null;
            if (data) {
                setProfileData(prev => ({ ...prev, ...data }));
            } else {
                setProfileData(prev => ({
                    ...prev,
                    feature_tag: value
                        ? {
                            ...(prev.feature_tag || {}),
                            slug: value,
                        }
                        : null,
                }));
            }
            showToast('Fenomen etiketi güncellendi.', 'success');
        } catch (error) {
            const msg = error.response?.data?.message || 'Fenomen etiketi güncellenemedi.';
            showToast(msg, 'error');
        } finally {
            setFeatureTagSaving(false);
        }
    };

    return (
        <>
            <SEO
                title={`${profileData?.name || username} - Herkesler Soruyor`}
                noindex={true}
            />
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
                            <div className="rounded-2xl shadow-soft overflow-hidden border" style={{ background: themeStyles.shellBg, borderColor: `${themeStyles.accentColor}50` }}>
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
                                            featureTag={profileData.feature_tag}
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
                                                viewerPrefs={viewerPrefs}
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
                                {/* Account Status Banner - Only for own profile */}
                                {isOwnProfile && profileData?.accountStatus && (
                                    <AccountStatusBanner accountStatus={profileData.accountStatus} />
                                )}

                                {/* Account Status Info for Other Users (if frozen/banned) */}
                                {!isOwnProfile && (
                                    (profileData?.accountStatus?.status === 'frozen' || profileData?.accountStatus?.status === 'banned' ||
                                        profileData?.frozen_at || profileData?.banned_at) && (
                                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 rounded-lg p-4">
                                            <div className="flex items-center gap-2">
                                                <FaExclamationTriangle className="text-yellow-500" />
                                                <div>
                                                    {(profileData?.accountStatus?.status === 'frozen' || profileData?.frozen_at) && (
                                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                                            <strong>Bu kullanıcının hesabı dondurulmuş.</strong>
                                                            {(profileData?.accountStatus?.until || profileData?.frozen_until) && (
                                                                <span className="ml-2">
                                                                    (Bitiş: {new Date(profileData?.accountStatus?.until || profileData?.frozen_until).toLocaleString('tr-TR')})
                                                                </span>
                                                            )}
                                                        </p>
                                                    )}
                                                    {(profileData?.accountStatus?.status === 'banned' || profileData?.banned_at) && (
                                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                                                            <strong>Bu kullanıcının hesabı banlanmış.</strong>
                                                            {(profileData?.accountStatus?.until || profileData?.banned_until) && (
                                                                <span className="ml-2">
                                                                    (Bitiş: {new Date(profileData?.accountStatus?.until || profileData?.banned_until).toLocaleString('tr-TR')})
                                                                </span>
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}

                                {/* Moderation Panel for Moderators */}
                                {(canModerate || profileData?.canModerate) && !isOwnProfile && (
                                    <div className="flex flex-col gap-3">
                                        <ModerationActionsPanel
                                            targetUser={profileData}
                                            onActionComplete={async (action, message) => {
                                                showToast(message, 'success');
                                                try {
                                                    const res = await usersAPI.getProfile(profileData.username);
                                                    const responseData = res.data.data;
                                                    // Backend'den gelen response yapısı: { success: true, data: { user: {...}, ... } } veya { success: true, data: {...} }
                                                    const userData = responseData.user || responseData;

                                                    setProfileData(prev => ({
                                                        ...prev,
                                                        ...userData,
                                                        accountStatus: responseData.accountStatus || userData.accountStatus || null,
                                                        // Fallback için eski alanları da güncelle
                                                        banned_at: userData.banned_at || null,
                                                        banned_until: userData.banned_until || (responseData.accountStatus?.status === 'banned' ? responseData.accountStatus?.until : null) || null,
                                                        banned_reason: userData.banned_reason || (responseData.accountStatus?.status === 'banned' ? responseData.accountStatus?.reason : null) || null,
                                                        frozen_at: userData.frozen_at || null,
                                                        frozen_until: userData.frozen_until || (responseData.accountStatus?.status === 'frozen' ? responseData.accountStatus?.until : null) || null,
                                                        frozen_reason: userData.frozen_reason || (responseData.accountStatus?.status === 'frozen' ? responseData.accountStatus?.reason : null) || null,
                                                        // Stats objesini koru veya güncelle
                                                        stats: {
                                                            questions: userData.stats?.questions ?? prev.stats?.questions ?? 0,
                                                            followers: userData.stats?.followers ?? prev.stats?.followers ?? 0,
                                                            following: userData.stats?.following ?? prev.stats?.following ?? 0,
                                                            answers: userData.stats?.answers ?? prev.stats?.answers ?? 0,
                                                            likes: userData.stats?.likes ?? prev.stats?.likes ?? 0,
                                                            badges: userData.badges?.length ?? prev.badges?.length ?? 0,
                                                            xperPoints: userData.xp ?? prev.xp ?? 0,
                                                            generalRank: userData.ranks?.general ?? prev.ranks?.general ?? '-',
                                                            categoryRank: userData.ranks?.gender ?? prev.ranks?.gender ?? '-'
                                                        }
                                                    }));
                                                } catch (err) {
                                                    console.error('Profile refresh error:', err);
                                                }
                                            }}
                                        />

                                        {isCurrentUserSuperAdmin && (
                                            <div className="flex justify-end">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setFeatureTagDraft(profileData.feature_tag?.slug || '');
                                                        setFeatureTagModalOpen(true);
                                                    }}
                                                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm hover:shadow-md hover:opacity-95 active:scale-95 transition-all"
                                                >
                                                    Fenomen Etiketi Ata
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <ProfileTabContent
                                    activeTab={activeTab}
                                    profileData={profileData}
                                    userQuestions={userQuestions}
                                    answers={answers}
                                    opinions={opinions}
                                    followers={followers}
                                    following={following}
                                    loading={tabLoading}
                                    isOwnProfile={isOwnProfile}
                                    isVIP={isVIP}
                                    viewerPrefs={viewerPrefs}
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

                {/* Feature Tag Modal */}
                {featureTagModalOpen && isCurrentUserSuperAdmin && !isOwnProfile && (
                    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-xl w-full p-6 md:p-7">
                            <h3 className="text-lg md:text-xl font-bold mb-1 text-gray-900 dark:text-white">
                                Fenomen Etiketi Seç
                            </h3>
                            <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Bu kullanıcı için öne çıkarmak istediğin fenomentagını seç. İstemezsen &quot;Yok&quot; seçeneği ile kaldırabilirsin.
                            </p>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                                {[
                                    { slug: '', name: 'Yok', desc: 'Hiçbir fenomen etiketi atama.', color: '#6B7280' },
                                    { slug: 'akimbukucu', name: 'Akımbükücü', desc: 'Trendlerin yönünü değiştiren.', color: '#FACC15' },
                                    { slug: 'algi-mimari', name: 'Algı Mimarı', desc: 'Algıyı baştan inşa eden.', color: '#6366F1' },
                                    { slug: 'nadirat', name: 'Nadirat', desc: 'Az bulunan, özel içerik üreten.', color: '#EC4899' },
                                    { slug: 'zihin-tetikleyici', name: 'Zihin Tetikleyici', desc: 'Düşünce ve aksiyon başlatan.', color: '#22C55E' },
                                    { slug: 'kultur-kodlayici', name: 'Kültür Kodlayıcı', desc: 'Kültürel kodları yeniden yazan.', color: '#F97316' },
                                    { slug: 'imza-karakter', name: 'İmza Karakter', desc: 'Taklit edilemez üslup sahibi.', color: '#0EA5E9' },
                                    { slug: 'vizyon-kasifi', name: 'Vizyon Kaşifi', desc: 'Kimsenin görmediğini gören.', color: '#A855F7' },
                                    { slug: 'yanki-ustasi', name: 'Yankı Ustası', desc: 'Sözleri uzun süre rezonans yaratan.', color: '#E11D48' },
                                    { slug: 'modern-bilge', name: 'Modern Bilge', desc: 'Teknoloji + bilgelik karması.', color: '#14B8A6' },
                                    { slug: 'oncul-izlek', name: 'Öncül İzlek', desc: 'Yolu ilk açan, iz bırakan.', color: '#4B5563' },
                                ].map((tag) => {
                                    const isSelected = featureTagDraft === tag.slug;
                                    return (
                                        <button
                                            key={tag.slug || 'none'}
                                            type="button"
                                            onClick={() => setFeatureTagDraft(tag.slug)}
                                            className={`text-left rounded-xl border px-3 py-2.5 text-xs md:text-sm transition-all ${
                                                isSelected
                                                    ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                                                    : 'hover:shadow-sm'
                                            }`}
                                            style={{
                                                borderColor: `${tag.color}55`,
                                                backgroundColor: isSelected ? `${tag.color}15` : 'transparent',
                                            }}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                <span
                                                    className="w-2 h-2 rounded-full"
                                                    style={{ backgroundColor: tag.color }}
                                                />
                                                <span
                                                    className="font-semibold"
                                                    style={{ color: tag.color }}
                                                >
                                                    {tag.name}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-gray-600 dark:text-gray-400">
                                                {tag.desc}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex justify-end gap-2 mt-2">
                                <button
                                    type="button"
                                    className="px-3 py-1.5 text-xs md:text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    onClick={() => setFeatureTagModalOpen(false)}
                                    disabled={featureTagSaving}
                                >
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    className="px-4 py-1.5 text-xs md:text-sm rounded-lg bg-coral text-white font-semibold hover:opacity-95 active:scale-95 transition-all disabled:opacity-70"
                                    onClick={() => {
                                        handleFeatureTagChange(featureTagDraft);
                                        setFeatureTagModalOpen(false);
                                    }}
                                    disabled={featureTagSaving}
                                >
                                    Kaydet
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </MainLayout>
        </>
    );
};

export default ProfilePage;
