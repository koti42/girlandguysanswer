import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaUserPlus, FaCheck } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';

const FollowersPage = () => {
    const { username } = useParams();

    // Mock followers data
    const followers = [
        {
            id: 1,
            username: 'Ahmet_K',
            name: 'Ahmet Kaya',
            avatar: 'https://i.pravatar.cc/150?u=f1',
            bio: 'Teknoloji ve oyun severim',
            isFollowing: false
        },
        {
            id: 2,
            username: 'Elif_M',
            name: 'Elif Metin',
            avatar: 'https://i.pravatar.cc/150?u=f2',
            bio: 'Moda ve güzellik bloggeri',
            isFollowing: true
        },
        {
            id: 3,
            username: 'Can_Y',
            name: 'Can Yılmaz',
            avatar: 'https://i.pravatar.cc/150?u=f3',
            bio: 'Seyahat meraklısı',
            isFollowing: false
        },
        {
            id: 4,
            username: 'Selin_A',
            name: 'Selin Arslan',
            avatar: 'https://i.pravatar.cc/150?u=f4',
            bio: 'Yemek tarifleri ve mutfak ipuçları',
            isFollowing: true
        },
        {
            id: 5,
            username: 'Mehmet_D',
            name: 'Mehmet Demir',
            avatar: 'https://i.pravatar.cc/150?u=f5',
            bio: 'Spor ve fitness',
            isFollowing: false
        }
    ];

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="bg-white rounded-2xl shadow-soft p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Takipçiler</h1>
                            <p className="text-gray-500">@{username} kullanıcısını takip edenler</p>
                        </div>
                        <Link to={`/profile/${username}`} className="text-coral hover:underline font-semibold">
                            Profile Dön
                        </Link>
                    </div>
                </div>

                {/* Followers List */}
                <div className="flex flex-col gap-4">
                    {followers.map(follower => (
                        <div key={follower.id} className="bg-white rounded-2xl shadow-soft p-6 hover:shadow-soft-hover transition-all">
                            <div className="flex items-start gap-4">
                                <Link to={`/profile/${follower.username}`}>
                                    <img
                                        src={follower.avatar}
                                        alt={follower.name}
                                        className="w-16 h-16 rounded-full border-2 border-gray-100 hover:border-coral transition-colors"
                                    />
                                </Link>

                                <div className="flex-1">
                                    <Link to={`/profile/${follower.username}`} className="hover:underline">
                                        <h3 className="font-bold text-lg text-gray-800">{follower.name}</h3>
                                        <p className="text-gray-500 text-sm">@{follower.username}</p>
                                    </Link>
                                    <p className="text-gray-600 mt-2">{follower.bio}</p>
                                </div>

                                {follower.isFollowing ? (
                                    <button className="flex items-center gap-2 bg-gray-100 text-gray-700 font-semibold py-2 px-4 rounded-2xl hover:bg-gray-200 transition-all">
                                        <FaCheck /> Takip Ediliyor
                                    </button>
                                ) : (
                                    <button className="flex items-center gap-2 bg-coral text-white font-semibold py-2 px-4 rounded-2xl hover:scale-105 transition-all shadow-md">
                                        <FaUserPlus /> Takip Et
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </MainLayout>
    );
};

export default FollowersPage;
