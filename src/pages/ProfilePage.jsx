import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaMapMarkerAlt, FaCalendarAlt, FaEdit, FaTrophy, FaMedal, FaStar, FaCrown } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import ProfileCover from '../components/ProfileCover';
import ProfileAvatar from '../components/ProfileAvatar';
import ProfileBadges from '../components/ProfileBadges';
import ProfileStats from '../components/ProfileStats';
import FollowersList from '../components/FollowersList';
import QuestionCard from '../components/QuestionCard';
import { questions } from '../data/mockData';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';

const ProfilePage = () => {
    const { username } = useParams();
    const [activeTab, setActiveTab] = useState('questions');
    const [isEditing, setIsEditing] = useState(false);
    const [profileData, setProfileData] = useState({
        username: username || 'Zeynep_Yildiz',
        name: 'Zeynep Yıldız',
        avatar: 'https://i.pravatar.cc/200?u=4',
        coverPhoto: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop',
        bio: 'Moda ve güzellik konularına meraklı bir kadın.',
        about: 'Moda tasarımı mezunuyum. 5 yıldır profesyonel olarak styling yapıyorum.',
        location: 'İstanbul, Türkiye',
        joinedDate: 'Ocak 2024',
        stats: { questions: 142, answers: 1283, followers: 5420, following: 892, likes: 12450 },
        badges: [
            { id: 1, name: 'Moda Gurusu', icon: FaCrown, color: 'text-gold' },
            { id: 2, name: 'Yardımsever', icon: FaTrophy, color: 'text-blue-500' },
            { id: 3, name: 'Popüler', icon: FaStar, color: 'text-coral' },
            { id: 4, name: 'Aktif Üye', icon: FaMedal, color: 'text-green-500' }
        ]
    });
    const [editForm, setEditForm] = useState({ ...profileData });
    // Default images
    const defaultAvatar = 'https://i.pravatar.cc/200?u=default';
    const defaultCover = 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200&h=400&fit=crop';

    // Mock data
    const userQuestions = questions.filter(q => q.user.name === profileData.username).slice(0, 5);
    const mockFollowers = [
        { id: 1, username: 'Ahmet_K', name: 'Ahmet Kaya', avatar: 'https://i.pravatar.cc/150?u=f1', bio: 'Teknoloji ve oyun', isFollowing: false },
        { id: 2, username: 'Elif_M', name: 'Elif Metin', avatar: 'https://i.pravatar.cc/150?u=f2', bio: 'Moda bloggeri', isFollowing: true }
    ];
    const mockFollowing = [
        { id: 1, username: 'Zeynep_Y', name: 'Zeynep Yıldız', avatar: 'https://i.pravatar.cc/150?u=fw1', bio: 'Moda ve güzellik' },
        { id: 2, username: 'Berk_D', name: 'Berk Demir', avatar: 'https://i.pravatar.cc/150?u=fw2', bio: 'İlişki danışmanı' }
    ];

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

    const handleSave = () => {
        setProfileData(editForm);
        setIsEditing(false);
    };

    return (
        <MainLayout sidebar={<><TrendsWidget /><TopUsersWidget /></>}>
            <div className="flex flex-col gap-6">
                {/* Profile Header */}
                <div className="bg-white rounded-2xl shadow-soft overflow-hidden">
                    <ProfileCover
                        coverPhoto={profileData.coverPhoto}
                        onCoverUpload={handleCoverUpload}
                        onCoverRemove={handleCoverRemove}
                    />

                    <div className="p-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <ProfileAvatar
                                avatar={profileData.avatar}
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
                                            className="w-full px-3 py-2 rounded-lg border focus:border-coral focus:ring-1 focus:ring-coral/20"
                                        />
                                        <textarea
                                            value={editForm.bio}
                                            onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                                            rows={2}
                                            className="w-full px-3 py-2 rounded-lg border focus:border-coral focus:ring-1 focus:ring-coral/20"
                                        />
                                        <div className="flex gap-2">
                                            <button onClick={handleSave} className="bg-coral text-white px-4 py-2 rounded-lg">Kaydet</button>
                                            <button onClick={() => setIsEditing(false)} className="border px-4 py-2 rounded-lg">İptal</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <h1 className="text-2xl font-bold text-gray-800">{profileData.name}</h1>
                                        <p className="text-gray-500">@{profileData.username}</p>
                                        <div className="mt-3">
                                            <ProfileBadges badges={profileData.badges} />
                                        </div>
                                        <p className="text-gray-700 mt-3">{profileData.bio}</p>
                                        <div className="flex gap-4 mt-2 text-sm text-gray-500">
                                            <div className="flex items-center gap-1"><FaMapMarkerAlt />{profileData.location}</div>
                                            <div className="flex items-center gap-1"><FaCalendarAlt />Katıldı {profileData.joinedDate}</div>
                                        </div>
                                        <div className="flex gap-2 mt-4">
                                            <button onClick={() => setIsEditing(true)} className="bg-gray-100 px-4 py-2 rounded-xl flex items-center gap-2"><FaEdit />Düzenle</button>
                                            <Link to={`/messages/${username}`}><button className="border-2 border-coral text-coral px-4 py-2 rounded-xl">Mesaj</button></Link>
                                            <button className="bg-coral text-white px-4 py-2 rounded-xl">Takip Et</button>
                                        </div>

                                        {/* Stats Tabs - Moved below buttons */}
                                        <div className="grid grid-cols-5 gap-2 mt-6">
                                            <button onClick={() => setActiveTab('questions')} className={`text-center hover:bg-gray-50 rounded-lg p-2 transition-colors ${activeTab === 'questions' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.questions}</div>
                                                <div className="text-xs text-gray-500">Sorular</div>
                                            </button>
                                            <button onClick={() => setActiveTab('answers')} className={`text-center hover:bg-gray-50 rounded-lg p-2 transition-colors ${activeTab === 'answers' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.answers}</div>
                                                <div className="text-xs text-gray-500">Cevaplar</div>
                                            </button>
                                            <button onClick={() => setActiveTab('followers')} className={`text-center hover:bg-gray-50 rounded-lg p-2 transition-colors ${activeTab === 'followers' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.followers}</div>
                                                <div className="text-xs text-gray-500">Takipçi</div>
                                            </button>
                                            <button onClick={() => setActiveTab('following')} className={`text-center hover:bg-gray-50 rounded-lg p-2 transition-colors ${activeTab === 'following' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg">{profileData.stats.following}</div>
                                                <div className="text-xs text-gray-500">Takip</div>
                                            </button>
                                            <button onClick={() => setActiveTab('liked')} className={`text-center hover:bg-gray-50 rounded-lg p-2 transition-colors ${activeTab === 'liked' ? 'bg-coral/10 border border-coral' : ''}`}>
                                                <div className="font-bold text-lg text-coral">{profileData.stats.likes}</div>
                                                <div className="text-xs text-gray-500">Beğeni</div>
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
                    {activeTab === 'questions' && (
                        <>
                            {/* Profile Statistics - Only in questions tab */}
                            <ProfileStats stats={profileData.stats} />

                            {/* About Section - Only in questions tab */}
                            {profileData.about && (
                                <div className="bg-white rounded-2xl shadow-soft p-6">
                                    <h2 className="text-lg font-bold mb-2">Hakkımda</h2>
                                    <p className="text-gray-700">{profileData.about}</p>
                                </div>
                            )}

                            {/* Questions */}
                            {userQuestions.map(q => <QuestionCard key={q.id} question={q} />)}
                        </>
                    )}
                    {activeTab === 'answers' && (
                        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Cevaplar yakında</div>
                    )}
                    {activeTab === 'followers' && <FollowersList followers={mockFollowers} type="followers" />}
                    {activeTab === 'following' && <FollowersList followers={mockFollowing} type="following" />}
                    {activeTab === 'liked' && (
                        <div className="bg-white rounded-2xl p-12 text-center text-gray-400">Beğenilenler yakında</div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ProfilePage;
