import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LiveKitRoom } from '@livekit/components-react';
import '@livekit/components-styles';
import { communityAPI } from '../services/api';
import VoiceRoomUI from '../components/Community/Room/VoiceRoomUI';
import TextRoomUI from '../components/Community/Room/TextRoomUI';
import InRoomChat from '../components/Community/Room/InRoomChat';
import MainLayout from '../layouts/MainLayout';
import { toast } from 'react-hot-toast';
import { TrendsWidget, TopUsersWidget } from '../components/Widgets';
import { useAuth } from '../context/AuthContext';
import { echo } from '../services/echo';
import SEO from '../components/SEO';

const RoomPage = () => {
    const { uuid } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const [token, setToken] = useState('');
    const [serverUrl, setServerUrl] = useState('');
    const [community, setCommunity] = useState(null);
    const [role, setRole] = useState('listener');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [hasJoinedAudio, setHasJoinedAudio] = useState(false);
    const [participantsCount, setParticipantsCount] = useState(null);
    const channelRef = useRef(null);
    const isHostRef = useRef(false);
    const communityUuidRef = useRef(null);

    useEffect(() => {
        const handleBeforeUnload = () => {
            if (isHostRef.current && communityUuidRef.current) {
                const token = localStorage.getItem('token');
                const API_URL = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';

                fetch(`${API_URL}/communities/${communityUuidRef.current}/leave`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    keepalive: true,
                    body: JSON.stringify({})
                }).catch(() => { });
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        const joinRoom = async () => {
            try {
                const response = await communityAPI.join(uuid);
                const { community: communityData, livekit_token, livekit_url } = response.data.data;

                setCommunity(communityData);
                setToken(livekit_token);
                setServerUrl(livekit_url);
                setParticipantsCount(communityData.participants_count ?? null);

                const currentUser = communityData.current_user || {};
                const isOwner = currentUser.is_owner === true;
                const derivedRole = isOwner ? 'host' : (currentUser.role || 'listener');

                setRole(derivedRole);
                isHostRef.current = isOwner;
                communityUuidRef.current = communityData.uuid || uuid;

                const channelName = `community.${communityData.uuid || uuid}`;
                const channel = echo.private(channelName);

                channel.listen('.participant_count.updated', (data) => {
                    if (data && typeof data.participants_count === 'number') {
                        setParticipantsCount(data.participants_count);
                    }
                });

                channel.listen('.community.ended', (_data) => {
                    if (channelRef.current) {
                        echo.leave(`community.${communityUuidRef.current || uuid}`);
                        channelRef.current = null;
                    }

                    if (isHostRef.current) {
                        toast("Yayını sonlandırdınız.", { icon: '👋' });
                    } else {
                        toast.error('Topluluk odası sohbeti bitti. Host odadan ayrıldı.', {
                            duration: 5000,
                            icon: '👋'
                        });
                    }

                    window.location.href = '/communities';
                });

                channel.listen('.role.changed', (data) => {
                    const { user_id, role: newRole } = data;
                    if (!user_id || !user) return;

                    const isCurrentUser = user.id === user_id ||
                        user.id?.toString() === user_id?.toString() ||
                        String(user.id) === String(user_id);

                    if (isCurrentUser) {
                        setRole(newRole);
                    }
                });

                channel.listen('.message.sent', (_data) => {
                });

                channelRef.current = channel;
            } catch (err) {
                const apiMessage = err.response?.data?.message;
                setError(apiMessage || 'Odaya bağlanılamadı.');
                toast.error(apiMessage || 'Odaya giriş yapılamadı.');
                setTimeout(() => navigate('/communities'), 2000);
            } finally {
                setLoading(false);
            }
        };

        if (user) {
            joinRoom();
        }

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);

            const cleanup = async () => {
                if (channelRef.current) {
                    echo.leave(`community.${communityUuidRef.current || uuid}`);
                    channelRef.current = null;
                }

                if (isHostRef.current && communityUuidRef.current) {
                    try {
                        await communityAPI.leave(communityUuidRef.current);
                    } catch {
                        // odadan çıkış en iyi çaba; sunucu zaten zaman aşımıyla düşürür
                    }
                }
            };

            cleanup();
        };
    }, [uuid, navigate, user]);

    const handleDisconnect = async () => {
        if (channelRef.current) {
            echo.leave(`community.${communityUuidRef.current || uuid}`);
            channelRef.current = null;
        }

        try {
            await communityAPI.leave(communityUuidRef.current || uuid);
        } catch {
            // odadan çıkış en iyi çaba; sunucu zaten zaman aşımıyla düşürür
        }

        toast("Oda sonlandırıldı/ayrılındı.", { icon: '👋' });
        window.location.href = '/communities';
    };

    const handleRaiseHand = async () => {
        try {
            await communityAPI.raiseHand(communityUuidRef.current || uuid);
            toast.success("El kaldırdın! Yöneticiler görüyor.");
        } catch {
            toast.error("İşlem başarısız.");
        }
    };


    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent} fullHeight>
            <SEO
                title={community?.title
                    ? `${community.title} - ${community.type === 'text' ? 'Yazılı' : 'Sesli'} Sohbet Odası | Herkesler Soruyor`
                    : 'Topluluk Odası | Herkesler Soruyor'}
                description={community?.title
                    ? `${community.title} odasına katıl, sohbete dahil ol. ${community.description || 'Topluluk sohbet odası.'}`
                    : 'Topluluk sohbet odasına katıl, sohbete dahil ol.'}
                jsonLd={community ? {
                    "@context": "https://schema.org",
                    "@type": "SocialMediaPosting",
                    "headline": community.title,
                    "description": community.description || 'Topluluk sohbet odası.',
                    "author": {
                        "@type": "Person",
                        "name": community.owner?.username || 'Herkesler Soruyor'
                    }
                } : undefined}
            />
            <div className="h-[calc(100vh-100px)] p-2">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                            <p className="text-gray-600 dark:text-gray-400 font-medium">Odaya bağlanılıyor...</p>
                        </div>
                    </div>
                ) : error ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                            <p className="text-red-500 dark:text-red-400 font-semibold mb-2">{error}</p>
                            <p className="text-gray-500 dark:text-gray-400 text-sm">Yönlendiriliyorsunuz...</p>
                        </div>
                    </div>
                ) : community?.type === 'text' ? (
                    <TextRoomUI
                        community={community}
                        participantsCount={participantsCount}
                        onLeave={handleDisconnect}
                    />
                ) : token && serverUrl ? (
                    <LiveKitRoom
                        video={false}
                        audio={true}
                        token={token}
                        serverUrl={serverUrl}
                        data-lk-theme="default"
                        style={{ height: '100%' }}
                        onConnected={() => {
                        }}
                        onDisconnected={() => {
                            if (channelRef.current) {
                                echo.leave(`community.${communityUuidRef.current || uuid}`);
                                channelRef.current = null;
                            }
                            toast("Yayın sona erdi.");
                            window.location.href = '/communities';
                        }}
                    >
                        {!hasJoinedAudio ? (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
                                <button
                                    onClick={() => setHasJoinedAudio(true)}
                                    className="px-8 py-4 bg-primary text-white rounded-full font-bold text-xl shadow-xl hover:scale-105 transition-transform animate-pulse"
                                >
                                    🎵 Yayına Bağlan / Dinle
                                </button>
                            </div>
                        ) : null}

                        <VoiceRoomUI
                            community={community}
                            role={role}
                            participantsCount={participantsCount}
                            onLeave={handleDisconnect}
                            onRaiseHand={handleRaiseHand}
                            onToggleChat={() => setIsChatOpen(!isChatOpen)}
                        />
                        <InRoomChat
                            communityId={communityUuidRef.current || uuid}
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                        />
                    </LiveKitRoom>
                ) : null}
            </div>
        </MainLayout>
    );
};

export default RoomPage;
