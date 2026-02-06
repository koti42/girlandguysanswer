import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { communityAPI } from '../services/api';
import CommunityCard from '../components/Community/CommunityCard';
import { FaPlus } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import CreateRoomModal from '../components/Community/CreateRoomModal';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import SEO from '../components/SEO';

const CommunityPage = () => {
    const [communities, setCommunities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchCommunities();
    }, []);

    const fetchCommunities = async () => {
        try {
            const res = await communityAPI.getAll();
            if (res.data && Array.isArray(res.data.data)) {
                setCommunities(res.data.data);
            } else {
                setCommunities([]);
            }
        } catch (error) {
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRoom = () => {
        setIsCreateModalOpen(true);
    };

    const handleJoinRoom = (community) => {
        navigate(`/community/${community.uuid}`);
    };

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <SEO
                title="Meydan - Herkesler Soruyor"
                description="Sesli sohbet odalarına katıl, yeni insanlarla tanış ve konular hakkında tartış."
                jsonLd={{
                    "@context": "https://schema.org",
                    "@type": "CollectionPage",
                    "name": "Meydan",
                    "description": "Sesli sohbet odaları ve tartışma grupları"
                }}
            />
            <div className="flex flex-col gap-6 min-h-[calc(100vh-100px)]">
                <div className="flex justify-between items-center mb-2">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Meydan</h1>
                </div>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                    </div>
                ) : communities.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {communities.map(c => (
                            <CommunityCard
                                key={c.id}
                                community={c}
                                onClick={handleJoinRoom}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                        <p className="text-lg">Henüz aktif bir oda yok.</p>
                        <p className="text-sm">İlk odayı sen oluştur!</p>
                    </div>
                )}

                {/* Floating Action Button */}
                <button
                    onClick={handleCreateRoom}
                    className="fixed bottom-24 right-6 md:bottom-10 md:right-10 w-14 h-14 bg-gradient-to-r from-coral to-orange-500 text-white rounded-full shadow-lg flex items-center justify-center hover:shadow-xl hover:scale-105 transition-all z-50 ring-4 ring-white dark:ring-gray-900"
                    aria-label="Oda Oluştur"
                >
                    <FaPlus size={24} />
                </button>
                <CreateRoomModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                />
            </div>
        </MainLayout>
    );
};

export default CommunityPage;
