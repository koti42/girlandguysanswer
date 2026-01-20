import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FaMapMarkerAlt, FaCalendarAlt, FaEdit, FaTrophy, FaMedal, FaStar, FaCrown } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import ProfileCover from '../components/ProfileCover';
import ProfileAvatar from '../components/ProfileAvatar';
import ProfileBadges from '../components/ProfileBadges';
import ProfileStats from '../components/ProfileStats';
import FollowersList from '../components/FollowersList';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';
import { useAuth } from '../context/AuthContext';
import { usersAPI, questionsAPI } from '../services/api';

const ProfilePage = () => {
    const { username } = useParams();
    const { user: currentUser } = useAuth();
    const isOwnProfile = !username || (currentUser && currentUser.username === username); // !username is for /profile route if exists, likely /profile/:username is mandatory

    const [activeTab, setActiveTab] = useState('questions');
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [profileData, setProfileData] = useState(null);
    const [userQuestions, setUserQuestions] = useState([]);
    const [editForm, setEditForm] = useState({ name: '', bio: '', location: '' });

    useEffect(() => {
        const fetchProfileData = async () => {
            setLoading(true);
            try {
                // If own profile, we might use getCurrentUser or filter usersAPI
                // Spec says GET /users/{username} works for everyone, but /user/me gives private details
                let data;
                let questionsData = [];

                if (isOwnProfile) {
                    // For own profile, use /user/me to get potentially private details + edit permissions implicitly
                    // However, to keep it simple and consistent with username param:
                    // If we are on /profile/myUsername, we can fetch via username but we know it's us.
                    const response = await usersAPI.getProfile(username || currentUser.username);
                    data = response.data.data;

                    // Fetch own questions
                    const qResponse = await questionsAPI.getMyQuestions();
                    questionsData = qResponse.data.data.questions;
                } else {
                    const response = await usersAPI.getProfile(username);
                    data = response.data.data;
                    questionsData = data.questions || []; // Spec says questions might be included or we filter
                }

                setProfileData({
                    ...data,
                    // Map API fields to UI fields if necessary
                    name: data.username, // UI uses name, API has username
                    coverPhoto: data.coverImage || 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop',
                    avatar: data.avatar || 'https://i.pravatar.cc/200?u=default',
                    location: data.location || 'Konum belirtilmedi', // API might not have location yet
                    joinedDate: new Date(data.created_at || Date.now()).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
                    badges: [], // API doesn't return badges yet
                    stats: {
                        questions: data.stats?.questions || 0,
                        followers: data.stats?.followers || 0,
                        following: data.stats?.following || 0,
                        answers: data.stats?.answers || 0,
                        likes: data.stats?.likes || 0
                    }
                });
                setUserQuestions(questionsData);

                // Initialize edit form
                if (isOwnProfile) {
                    setEditForm({
                        name: data.username || '', // Use username as name fallback
                        bio: data.bio || '',
                        location: data.location || '',
                    });
                }
            } catch (error) {
                console.error("Profil yüklenirken hata:", error);
            } finally {
                setLoading(false);
            }
        };

        if (username || currentUser) {
            fetchProfileData();
        }
    }, [username, currentUser, isOwnProfile]);

    if (loading) return <MainLayout><div className="flex justify-center p-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div></div></MainLayout>;

    if (!profileData) return <MainLayout><div className="text-center p-10">Kullanıcı bulunamadı</div></MainLayout>;

    // Rest of component...

    const handleAvatarUpload = (file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setProfileData(prev => ({ ...prev, avatar: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    const handleAvatarRemove = () => {
        setProfileData(prev => ({ ...prev, avatar: defaultAvatar }));
    };

    const handleCoverUpload = (file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            setProfileData(prev => ({ ...prev, coverPhoto: reader.result }));
        };
        reader.readAsDataURL(file);
    };

    const handleCoverRemove = () => {
        setProfileData(prev => ({ ...prev, coverPhoto: defaultCover }));
    };

    // Social Action Handlers
    const handleFollowToggle = async () => {
        if (!profileData) return;
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
            } else if (profileData.hasPendingRequest) {
                // Cancel Request
                await usersAPI.unfollow(profileData.username);
                setProfileData(prev => ({ ...prev, hasPendingRequest: false }));
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
            }
        } catch (error) {
            console.error("Takip işlemi hatası:", error);
        }
    };

    const handleBlockToggle = async () => {
        if (!profileData) return;
        if (!window.confirm("Bu kullanıcıyı engellemek istediğinize emin misiniz?")) return;

        try {
            await usersAPI.block(profileData.username);
            alert("Kullanıcı engellendi.");
            // navigate('/'); // Optional: redirect home
        } catch (error) {
            console.error("Engelleme hatası:", error);
        }
    };

    const handleSave = () => {
        setProfileData(prev => ({ ...prev, ...editForm }));
        setIsEditing(false);
        // Here you would typically call an API to update the user profile
    };

    return (
        <MainLayout sidebar={<><TrendsWidget /><TopUsersWidget /></>}>
            <div className="flex flex-col gap-6">
                {/* Profile Header */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft overflow-hidden">
                    <ProfileCover
                        coverPhoto={profileData.coverPhoto}
                        onCoverUpload={handleCoverUpload}
                        onCoverRemove={handleCoverRemove}
                    />

                    <div className="p-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <ProfileAvatar
                                avatar={profileData.avatar}
                                username={profileData.username}
                                onAvatarUpload={handleAvatarUpload}
                                onAvatarRemove={handleAvatarRemove}
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
                                                    <Link to={`/messages/${profileData.username}`}>
                                                        <button className="border-2 border-coral text-coral px-4 py-2 rounded-xl hover:bg-coral hover:text-white transition-colors">
                                                            Mesaj
                                                        </button>
                                                    </Link>
                                                    <button
                                                        onClick={handleFollowToggle}
                                                        className={`px-4 py-2 rounded-xl text-white transition-colors shadow-md ${profileData.isFollowing
                                                            ? 'bg-gray-500 hover:bg-gray-600'
                                                            : profileData.hasPendingRequest
                                                                ? 'bg-yellow-500 hover:bg-yellow-600'
                                                                : 'bg-coral hover:bg-coral-dark'
                                                            }`}
                                                    >
                                                        {profileData.isFollowing ? 'Takip Ediliyor' : profileData.hasPendingRequest ? 'İstek Gönderildi' : 'Takip Et'}
                                                    </button>
                                                    <button
                                                        onClick={handleBlockToggle}
                                                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Kullanıcıyı Engelle"
                                                    >
                                                        🚫
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Stats Tabs - Moved below buttons */}
                                        <div className="grid grid-cols-5 gap-2 mt-6">
                                            <button onClick={() => setActiveTab('questions')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'questions' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.questions}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Sorular</div>
                                            </button>
                                            <button onClick={() => setActiveTab('answers')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'answers' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.answers}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Cevaplar</div>
                                            </button>
                                            <button onClick={() => setActiveTab('followers')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'followers' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.followers}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Takipçi</div>
                                            </button>
                                            <button onClick={() => setActiveTab('following')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'following' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.following}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Takip</div>
                                            </button>
                                            <button onClick={() => setActiveTab('liked')} className={`text-center hover:bg-gray-50 dark:bg-gray-700 rounded-lg p-2 transition-colors ${activeTab === 'liked' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg text-coral">{profileData.stats.likes}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">Beğeni</div>
                                            </button>
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
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center text-gray-400">Cevaplar yakında</div>
                    )}
                    {activeTab === 'followers' && <FollowersList followers={mockFollowers} type="followers" />}
                    {activeTab === 'following' && <FollowersList followers={mockFollowing} type="following" />}
                    {activeTab === 'liked' && (
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center text-gray-400">Beğenilenler yakında</div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ProfilePage;
