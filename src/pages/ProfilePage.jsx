import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FaMapMarkerAlt, FaCalendarAlt, FaEdit, FaTrophy, FaMedal, FaStar, FaCrown, FaUserSecret, FaLock, FaEllipsisH, FaBan, FaFlag, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import ProfileCover from '../components/ProfileCover';
import ProfileAvatar from '../components/ProfileAvatar';
import ProfileBadges from '../components/ProfileBadges';
import ProfileStats from '../components/ProfileStats';
import FollowersList from '../components/FollowersList';
import QuestionCard from '../components/QuestionCard';
import AnswerCard from '../components/AnswerCard';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';
import { useAuth } from '../context/AuthContext';
import { usersAPI, questionsAPI } from '../services/api';
import Toast from '../components/Toast';

const ProfilePage = () => {
    const { username } = useParams();
    const navigate = useNavigate();
    const { user: currentUser, updateUser } = useAuth();
    const isOwnProfile = !username || (currentUser && currentUser.username === username); // !username is for /profile route if exists, likely /profile/:username is mandatory

    const [activeTab, setActiveTab] = useState('questions');
    const [isEditing, setIsEditing] = useState(false);

    // Actions Menu State
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const actionsMenuRef = useRef(null);
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [showUnblockModal, setShowUnblockModal] = useState(false);

    // Click outside handler for actions menu
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
            setLoading(true);
            try {
                // ... (existing profile fetch logic)
                let data;
                let questionsData = [];

                if (isOwnProfile) {
                    const response = await usersAPI.getProfile(username || currentUser.username);
                    data = response.data.data;
                    const qResponse = await questionsAPI.getMyQuestions();
                    questionsData = qResponse.data.data.questions;
                } else {
                    const response = await usersAPI.getProfile(username);
                    data = response.data.data;
                    questionsData = data.questions || [];
                }

                setProfileData({
                    ...data,
                    name: data.username,
                    coverPhoto: data.coverImage || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop',
                    avatar: data.avatar || 'https://i.pravatar.cc/200?u=default',
                    location: data.location || 'Konum belirtilmedi',
                    joinedDate: new Date(data.created_at || Date.now()).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
                    badges: [],
                    // Include relationship status from backend
                    isFollowing: data.isFollowing || false,
                    hasPendingRequest: data.hasPendingRequest || false,
                    isPrivate: data.isPrivate || false,
                    allow_following: data.allow_following !== undefined ? data.allow_following : true,
                    allow_messaging: data.allow_messaging !== undefined ? data.allow_messaging : true,
                    messaging_mode: data.messaging_mode || 'everyone',
                    // Block status
                    hasBlocked: data.hasBlocked || false,  // Ben bu kullanıcıyı engelledim mi?
                    isBlocked: data.isBlocked || false,    // Bu kullanıcı beni engelledi mi?
                    stats: {
                        questions: data.stats?.questions || 0,
                        followers: data.stats?.followers || 0,
                        following: data.stats?.following || 0,
                        answers: data.stats?.answers || 0,
                        likes: data.stats?.likes || 0
                    }
                });
                setUserQuestions(questionsData);

                // Fetch initial followers/following only if likely small or needed, 
                // but better to fetch on tab change.

                if (isOwnProfile) {
                    setEditForm({
                        name: data.username || '',
                        bio: data.bio || '',
                        location: data.location || '',
                    });
                }
            } catch (error) {
                // Handle error silently or show toast
            } finally {
                setLoading(false);
            }
        };

        if (username || currentUser) {
            fetchProfileData();
        }
    }, [username, currentUser, isOwnProfile]);

    // New Effect for fetching tab data
    useEffect(() => {
        const fetchTabData = async () => {
            if (!profileData || !profileData.username) return;

            try {
                if (activeTab === 'followers') {
                    const res = await usersAPI.getFollowers(profileData.username);
                    setFollowers(res.data.data.followers || res.data.data || []);
                } else if (activeTab === 'following') {
                    const res = await usersAPI.getFollowing(profileData.username);
                    setFollowing(res.data.data.following || res.data.data || []);
                } else if (activeTab === 'answers') {
                    // Check if we can view answers (privacy check)
                    const canViewAnswers = isOwnProfile || !profileData.isPrivate || profileData.isFollowing;
                    if (canViewAnswers) {
                        const res = await usersAPI.getUserAnswers(profileData.username);
                        setAnswers(res.data.data.answers || res.data.data || []);
                    } else {
                        setAnswers([]);
                    }
                }
            } catch (error) {
                // Fallback to empty to prevent crash
                if (activeTab === 'followers') setFollowers([]);
                if (activeTab === 'following') setFollowing([]);
                if (activeTab === 'answers') setAnswers([]);
            }
        };

        fetchTabData();
    }, [activeTab, profileData, isOwnProfile]);

    if (loading) return <MainLayout><div className="flex justify-center p-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div></div></MainLayout>;

    if (!profileData) return <MainLayout><div className="text-center p-10">Kullanıcı bulunamadı</div></MainLayout>;

    // Rest of component...

    const handleAvatarUpload = async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await usersAPI.uploadAvatar(formData);
            console.log('Avatar Upload Response:', response.data);
            if ((response.data.status === 'success' || response.data.success)) {
                const newAvatarUrl = response.data.data.avatar_url;

                if (newAvatarUrl) {
                    setProfileData(prev => ({ ...prev, avatar: newAvatarUrl }));

                    if (currentUser && (currentUser.username === profileData.username || isOwnProfile)) {
                        updateUser({ avatar: newAvatarUrl });
                    }
                    showToast('Profil fotoğrafı güncellendi.', 'success');
                } else {
                    console.error('Avatar URL missing in response:', response.data);
                    showToast('Sunucudan avatar adresi alınamadı.', 'error');
                }
            }
        } catch (error) {
            console.error('Avatar upload error:', error);
            const errorMessage = error.response?.data?.errors?.file?.[0] ||
                error.response?.data?.message ||
                'Profil fotoğrafı yüklenirken bir hata oluştu.';
            showToast(errorMessage, 'error');
        }
    };

    const handleAvatarRemove = () => {
        setProfileData(prev => ({ ...prev, avatar: defaultAvatar }));
    };

    const handleCoverUpload = async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await usersAPI.uploadCoverImage(formData);
            console.log('Cover Upload Response:', response.data);
            if ((response.data.status === 'success' || response.data.success)) {
                const newCoverUrl = response.data.data.cover_image_url || response.data.data.cover_url;

                if (newCoverUrl) {
                    setProfileData(prev => ({ ...prev, coverPhoto: newCoverUrl }));

                    if (currentUser && (currentUser.username === profileData.username || isOwnProfile)) {
                        updateUser({ cover_image: newCoverUrl });
                    }
                    showToast('Kapak fotoğrafı güncellendi.', 'success');
                } else {
                    console.error('Cover URL missing in response:', response.data);
                    showToast('Sunucudan resim adresi alınamadı.', 'error');
                }
            }
        } catch (error) {
            console.error('Cover upload error:', error);
            const errorMessage = error.response?.data?.errors?.file?.[0] ||
                error.response?.data?.message ||
                'Kapak fotoğrafı yüklenirken bir hata oluştu.';
            showToast(errorMessage, 'error');
        }
    };

    const handleCoverRemove = () => {
        setProfileData(prev => ({ ...prev, coverPhoto: defaultCover }));
    };

    const handleFollowToggle = async () => {
        if (!profileData) return;

        // Check if following is disabled
        if (profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest) {
            showToast('Bu kullanıcı takip edilmeyi kapatmış.', 'warning');
            return;
        }

        try {
            if (profileData.isFollowing) {
                // Unfollow
                await usersAPI.unfollow(profileData.username);
                setProfileData(prev => ({
                    ...prev,
                    isFollowing: false,
                    hasPendingRequest: false,
                    stats: { ...prev.stats, followers: Math.max(0, (prev.stats?.followers || 0) - 1) }
                }));
                showToast('Takipten çıkıldı.', 'success');
            } else if (profileData.hasPendingRequest) {
                // Cancel Request
                await usersAPI.unfollow(profileData.username);
                setProfileData(prev => ({ ...prev, hasPendingRequest: false }));
                showToast('Takip isteği iptal edildi.', 'success');
            } else {
                // Follow
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
            } else if (error.response?.status === 404) {
                showToast('Kullanıcı bulunamadı.', 'error');
            } else {
                showToast('Takip işlemi başarısız oldu. Lütfen tekrar deneyin.', 'error');
            }
        }
    };

    const handleBlockToggle = () => {
        if (!profileData) return;
        setShowBlockModal(true);
    };

    const confirmBlock = async () => {
        try {
            await usersAPI.block(profileData.username);
            setShowBlockModal(false);
            setProfileData(prev => ({
                ...prev,
                hasBlocked: true,        // ✅ Ben engelledim
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
            const errorMsg = error.response?.data?.message || 'Engelleme işlemi başarısız oldu.';
            showToast(errorMsg, 'error');
        }
    };

    const handleUnblock = () => {
        if (!profileData) return;
        setShowUnblockModal(true);
    };

    const confirmUnblock = async () => {
        try {
            await usersAPI.unblock(profileData.username);
            setShowUnblockModal(false);

            const response = await usersAPI.getProfile(profileData.username);
            const data = response.data.data;

            setProfileData({
                ...data,
                name: data.username,
                coverPhoto: data.coverImage || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop',
                avatar: data.avatar || 'https://i.pravatar.cc/200?u=default',
                location: data.location || 'Konum belirtilmedi',
                joinedDate: new Date(data.created_at || Date.now()).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
                badges: [],
                isFollowing: data.isFollowing || false,
                hasPendingRequest: data.hasPendingRequest || false,
                isPrivate: data.isPrivate || false,
                allow_following: data.allow_following !== undefined ? data.allow_following : true,
                allow_messaging: data.allow_messaging !== undefined ? data.allow_messaging : true,
                messaging_mode: data.messaging_mode || 'everyone',
                hasBlocked: data.hasBlocked || false,
                isBlocked: data.isBlocked || false,
                stats: {
                    questions: data.stats?.questions || 0,
                    followers: data.stats?.followers || 0,
                    following: data.stats?.following || 0,
                    answers: data.stats?.answers || 0,
                    likes: data.stats?.likes || 0
                }
            });

            showToast('Engel başarıyla kaldırıldı.', 'success');
        } catch (error) {
            setShowUnblockModal(false);
            const errorMsg = error.response?.data?.message || 'Engel kaldırma işlemi başarısız oldu.';
            showToast(errorMsg, 'error');
        }
    };

    const handleSave = () => {
        setProfileData(prev => ({ ...prev, ...editForm }));
        setIsEditing(false);
        // Here you would typically call an API to update the user profile
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
                <div className="flex flex-col gap-6">
                    {/* Blocked by User (isBlocked: true) - Bu kullanıcı beni engelledi */}
                    {!isOwnProfile && profileData.isBlocked ? (
                        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-16 text-center">
                            <div className="relative w-24 h-24 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                                <FaBan className="text-5xl text-red-500 dark:text-red-400" />
                                <div className="absolute inset-0 rounded-full border-4 border-dashed border-red-200 dark:border-red-600 animate-spin" style={{ animationDuration: '3s' }}></div>
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                                ⛔ Bu Kullanıcı Sizi Engelledi
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
                                @{profileData.username} sizi engelledi. Profilini ve içeriklerini görüntüleyemezsiniz.
                            </p>
                            <button
                                onClick={() => navigate(-1)}
                                className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
                            >
                                ← Geri Dön
                            </button>
                        </div>
                    ) : !isOwnProfile && profileData.hasBlocked ? (
                        /* I Blocked User (hasBlocked: true) - Ben bu kullanıcıyı engelledim */
                        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-800/50 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-16 text-center">
                            <div className="relative w-24 h-24 bg-gradient-to-br from-orange-100 to-red-100 dark:from-orange-900/30 dark:to-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                                <FaBan className="text-5xl text-orange-500 dark:text-orange-400" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                                🚫 Bu Kullanıcıyı Engellediniz
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400 max-w-md mx-auto mb-8">
                                @{profileData.username} kullanıcısını engellediniz. Profil içeriği gizli.
                            </p>
                            <div className="flex gap-3 justify-center">
                                <button
                                    onClick={handleUnblock}
                                    className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg"
                                >
                                    Engeli Kaldır
                                </button>
                                <button
                                    onClick={() => navigate(-1)}
                                    className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold transition-all hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    ← Geri Dön
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Normal Profile */
                        <>
                            {/* Profile Header */}
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft overflow-hidden">
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

                                        <div className="flex-1">
                                            {isEditing ? (
                                                <div className="space-y-3">
                                                    <input
                                                        type="text"
                                                        value={editForm.name}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-coral focus:ring-1 focus:ring-coral/20"
                                                    />
                                                    <textarea
                                                        value={editForm.bio}
                                                        onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                                                        rows={2}
                                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:border-coral focus:ring-1 focus:ring-coral/20"
                                                    />
                                                    <div className="flex gap-2">
                                                        <button onClick={handleSave} className="bg-coral text-white px-4 py-2 rounded-lg">Kaydet</button>
                                                        <button onClick={() => setIsEditing(false)} className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg dark:text-gray-300">İptal</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">{profileData.name}</h1>
                                                    <p className="text-gray-500 dark:text-gray-400">@{profileData.username}</p>
                                                    <div className="mt-3">
                                                        <ProfileBadges badges={profileData.badges} />
                                                    </div>
                                                    <p className="text-gray-700 mt-3">{profileData.bio}</p>
                                                    <div className="flex gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                                                        <div className="flex items-center gap-1"><FaMapMarkerAlt />{profileData.location}</div>
                                                        <div className="flex items-center gap-1"><FaCalendarAlt />Katıldı {profileData.joinedDate}</div>
                                                    </div>
                                                    <div className="flex gap-2 mt-4">
                                                        {isOwnProfile ? (
                                                            <button onClick={() => setIsEditing(true)} className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-xl flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                                                <FaEdit /> Düzenle
                                                            </button>
                                                        ) : (
                                                            <div className="flex items-center gap-2">
                                                                {/* Message Button - Check messaging settings */}
                                                                {profileData.allow_messaging &&
                                                                    (profileData.messaging_mode === 'everyone' ||
                                                                        (profileData.messaging_mode === 'followers' && profileData.isFollowing)) && (
                                                                        <Link to={`/messages/${profileData.username}`}>
                                                                            <button className="border-2 border-coral text-coral px-4 py-2 rounded-xl hover:bg-coral hover:text-white transition-colors">
                                                                                Mesaj
                                                                            </button>
                                                                        </Link>
                                                                    )}

                                                                {/* Follow Button - Disabled if allow_following is false AND not following yet */}
                                                                <button
                                                                    onClick={handleFollowToggle}
                                                                    disabled={profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest}
                                                                    className={`px-4 py-2 rounded-xl text-white transition-colors shadow-md ${(profileData.allow_following === false && !profileData.isFollowing && !profileData.hasPendingRequest)
                                                                        ? 'bg-gray-300 cursor-not-allowed'
                                                                        : profileData.isFollowing
                                                                            ? 'bg-gray-500 hover:bg-gray-600'
                                                                            : profileData.hasPendingRequest
                                                                                ? 'bg-yellow-500 hover:bg-yellow-600'
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
                                                                {/* More Options Menu (Block, Report) */}
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
                                                                                        showToast('Kullanıcı şikayet edildi.', 'success');
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
                                                                                            handleUnblock();
                                                                                        } else {
                                                                                            handleBlockToggle();
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
                                                        )}
                                                    </div>

                                                    {/* Stats Tabs - Moved below buttons */}
                                                    <div className="grid grid-cols-5 gap-2 mt-6">
                                                        {/* Questions Tab - Locked for private accounts when not following */}
                                                        {isOwnProfile || !profileData.isPrivate || profileData.isFollowing ? (
                                                            <button onClick={() => setActiveTab('questions')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'questions' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                                <div className="font-bold text-lg">{profileData.stats.questions}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Sorular</div>
                                                            </button>
                                                        ) : (
                                                            <button disabled className="text-center rounded-lg p-2 opacity-50 cursor-not-allowed">
                                                                <div className="font-bold text-lg flex items-center justify-center gap-1">
                                                                    <FaLock className="text-sm" />
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Sorular</div>
                                                            </button>
                                                        )}

                                                        {/* Answers Tab - Locked for private accounts when not following */}
                                                        {isOwnProfile || !profileData.isPrivate || profileData.isFollowing ? (
                                                            <button onClick={() => setActiveTab('answers')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'answers' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                                <div className="font-bold text-lg">{profileData.stats.answers}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Cevaplar</div>
                                                            </button>
                                                        ) : (
                                                            <button disabled className="text-center rounded-lg p-2 opacity-50 cursor-not-allowed">
                                                                <div className="font-bold text-lg flex items-center justify-center gap-1">
                                                                    <FaLock className="text-sm" />
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Cevaplar</div>
                                                            </button>
                                                        )}

                                                        {/* Followers Tab - Hidden for private accounts when not following */}
                                                        {isOwnProfile || !profileData.isPrivate || profileData.isFollowing ? (
                                                            <button onClick={() => setActiveTab('followers')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'followers' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                                <div className="font-bold text-lg">{profileData.stats.followers}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Takipçi</div>
                                                            </button>
                                                        ) : (
                                                            <button disabled className="text-center rounded-lg p-2 opacity-50 cursor-not-allowed">
                                                                <div className="font-bold text-lg flex items-center justify-center gap-1">
                                                                    <FaLock className="text-sm" />
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Takipçi</div>
                                                            </button>
                                                        )}

                                                        {/* Following Tab - Hidden for private accounts when not following */}
                                                        {isOwnProfile || !profileData.isPrivate || profileData.isFollowing ? (
                                                            <button onClick={() => setActiveTab('following')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'following' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                                <div className="font-bold text-lg">{profileData.stats.following}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Takip</div>
                                                            </button>
                                                        ) : (
                                                            <button disabled className="text-center rounded-lg p-2 opacity-50 cursor-not-allowed">
                                                                <div className="font-bold text-lg flex items-center justify-center gap-1">
                                                                    <FaLock className="text-sm" />
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Takip</div>
                                                            </button>
                                                        )}

                                                        {/* Liked Tab - Locked for private accounts when not following */}
                                                        {isOwnProfile || !profileData.isPrivate || profileData.isFollowing ? (
                                                            <button onClick={() => setActiveTab('liked')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'liked' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                                <div className="font-bold text-lg text-coral">{profileData.stats.likes}</div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Beğeni</div>
                                                            </button>
                                                        ) : (
                                                            <button disabled className="text-center rounded-lg p-2 opacity-50 cursor-not-allowed">
                                                                <div className="font-bold text-lg flex items-center justify-center gap-1">
                                                                    <FaLock className="text-sm text-coral opacity-50" />
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">Beğeni</div>
                                                            </button>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Content - Right after tabs */}
                            <div className="flex flex-col gap-6">
                                {profileData.isPrivate && !profileData.isFollowing && !isOwnProfile ? (
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center shadow-soft border border-gray-100 dark:border-gray-700">
                                        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <FaUserSecret className="text-4xl text-gray-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Bu Hesap Gizli</h3>
                                        <p className="text-gray-500 dark:text-gray-400">
                                            Bu kullanıcının paylaşımlarını görmek için takip etmelisin.
                                        </p>
                                    </div>
                                ) : (
                                    activeTab === 'questions' && (
                                        <>
                                            {/* Profile Statistics - Only in questions tab */}
                                            <ProfileStats stats={profileData.stats} />

                                            {/* About Section - Only in questions tab */}
                                            {profileData.about && (
                                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                                                    <h2 className="text-lg font-bold mb-2">Hakkımda</h2>
                                                    <p className="text-gray-700 dark:text-gray-300">{profileData.about}</p>
                                                </div>
                                            )}

                                            {/* Content Tabs */}
                                            <div className="space-y-4">
                                                <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                                                    {isOwnProfile ? 'Sorularım' : `${profileData.name} Soruları`}
                                                </h3>
                                                {userQuestions.length > 0 ? (
                                                    userQuestions.map(q => (
                                                        <QuestionCard key={q.id} question={q} />
                                                    ))
                                                ) : (
                                                    <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl">
                                                        <p className="text-gray-500">Henüz hiç soru sorulmamış.</p>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )
                                )}
                                {activeTab === 'answers' && (
                                    profileData.isPrivate && !profileData.isFollowing && !isOwnProfile ? (
                                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-10 text-center shadow-soft border border-gray-100 dark:border-gray-700">
                                            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <FaLock className="text-4xl text-gray-400" />
                                            </div>
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Bu İçerik Gizli</h3>
                                            <p className="text-gray-500 dark:text-gray-400">
                                                Bu kullanıcının cevaplarını görmek için takip etmelisin.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">
                                                {isOwnProfile ? 'Cevaplarım' : `${profileData.name} Cevapları`}
                                            </h3>
                                            {answers.length > 0 ? (
                                                answers.map(answer => (
                                                    <AnswerCard key={answer.id} answer={answer} />
                                                ))
                                            ) : (
                                                <div className="text-center py-10 bg-white dark:bg-gray-800 rounded-2xl">
                                                    <p className="text-gray-500">Henüz hiç cevap verilmemiş.</p>
                                                </div>
                                            )}
                                        </div>
                                    )
                                )}
                                {activeTab === 'followers' && <FollowersList followers={followers} type="followers" />}
                                {activeTab === 'following' && <FollowersList followers={following} type="following" />}
                                {activeTab === 'liked' && (
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center text-gray-400">Beğenilenler yakında</div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </MainLayout>

            {/* Block Confirmation Modal */}
            {showBlockModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FaExclamationTriangle className="text-3xl text-red-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Kullanıcıyı Engelle
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">
                                <strong>@{profileData?.username}</strong> adlı kullanıcıyı engellemek istediğinize emin misiniz? Bu işlem geri alınamaz ve birbirinizin içeriklerini göremeyeceksiniz.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowBlockModal(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={confirmBlock}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors shadow-lg shadow-red-500/30"
                                >
                                    Engelle
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Unblock Confirmation Modal */}
            {showUnblockModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <FaCheckCircle className="text-3xl text-green-500" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                                Engeli Kaldır
                            </h3>
                            <p className="text-gray-500 dark:text-gray-400 mb-6">
                                <strong>@{profileData?.username}</strong> adlı kullanıcının engelini kaldırmak istediğinize emin misiniz? Bu kullanıcı sizinle tekrar etkileşime geçebilecek.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowUnblockModal(false)}
                                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Vazgeç
                                </button>
                                <button
                                    onClick={confirmUnblock}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold transition-all shadow-lg shadow-green-500/30"
                                >
                                    Engeli Kaldır
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ProfilePage;
