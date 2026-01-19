import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { FaTimes } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';

const FollowingPage = () => {
    const { username } = useParams();

    // Mock following data
    const following = [
        {
            id: 1,
            username: 'Zeynep_Y',
            name: 'Zeynep Yıldız',
            avatar: 'https://i.pravatar.cc/150?u=fw1',
            bio: 'Moda ve güzellik'
        },
        {
            id: 2,
            username: 'Berk_D',
            name: 'Berk Demir',
            avatar: 'https://i.pravatar.cc/150?u=fw2',
            bio: 'İlişki danışmanı'
        },
        {
            id: 3,
            username: 'Ayse_K',
            name: 'Ayşe Kara',
            avatar: 'https://i.pravatar.cc/150?u=fw3',
            bio: 'Sağlık ve beslenme uzmanı'
        },
        {
            id: 4,
            username: 'Emre_T',
            name: 'Emre Taş',
            avatar: 'https://i.pravatar.cc/150?u=fw4',
            bio: 'Teknoloji editörü'
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
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-gray-800">Takip Edilenler</h1>
                            <p className="text-gray-500">@{username} kullanıcısının takip ettikleri</p>
                        </div>
                        <Link to={`/profile/${username}`} className="text-coral hover:underline font-semibold">
                            Profile Dön
                        </Link>
                    </div>
                </div>

                {/* Following List */}
                <div className="flex flex-col gap-4">
                    {following.map(user => (
                        <div key={user.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 hover:shadow-soft-hover transition-all">
                            <div className="flex items-start gap-4">
                                <Link to={`/profile/${user.username}`}>
                                    <img
                                        src={user.avatar}
                                        alt={user.name}
                                        className="w-16 h-16 rounded-full border-2 border-gray-100 hover:border-coral transition-colors"
                                    />
                                </Link>

                                <div className="flex-1">
                                    <Link to={`/profile/${user.username}`} className="hover:underline">
                                        <h3 className="font-bold text-lg text-gray-800">{user.name}</h3>
                                        <p className="text-gray-500 text-sm">@{user.username}</p>
                                    </Link>
                                    <p className="text-gray-600 mt-2">{user.bio}</p>
                                </div>

                                <button className="flex items-center gap-2 bg-red-50 text-red-600 font-semibold py-2 px-4 rounded-2xl hover:bg-red-100 transition-all">
                                    <FaTimes /> Takibi Bırak
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </MainLayout>
    );
};

export default FollowingPage;
