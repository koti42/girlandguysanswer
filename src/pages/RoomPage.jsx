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

                const currentUser = communityData.current_user || {};
                const isOwner = currentUser.is_owner === true;
                const derivedRole = isOwner ? 'host' : (currentUser.role || 'listener');

                setRole(derivedRole);
                isHostRef.current = isOwner;
                communityUuidRef.current = communityData.uuid || uuid;

                const channelName = `community.${communityData.uuid || uuid}`;
                const channel = echo.private(channelName);

                channel.listen('.community.ended', (data) => {
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

                channel.listen('.message.sent', (data) => {
                });

                channelRef.current = channel;
            } catch (err) {
                setError("Odaya bağlanılamadı.");
                toast.error("Odaya giriş yapılamadı.");
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
                    } catch (err) {
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
        } catch (err) {
        }

        toast("Oda sonlandırıldı/ayrılındı.", { icon: '👋' });
        window.location.href = '/communities';
    };

    const handleRaiseHand = async () => {
        try {
            const response = await communityAPI.raiseHand(communityUuidRef.current || uuid);
            toast.success("El kaldırdın! Yöneticiler görüyor.");
        } catch (err) {
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
            {community && (
                <SEO
                    title={`${community.name} - Sesli Sohbet Odası | Herkesler Soruyor`}
                    description={`${community.name} odasına katıl, sohbete dahil ol. ${community.description || 'Topluluk sohbet odası.'}`}
                    jsonLd={{
                        "@context": "https://schema.org",
                        "@type": "SocialMediaPosting",
                        "headline": community.name,
                        "description": community.description || 'Topluluk sohbet odası.',
                        "author": {
                            "@type": "Person",
                            "name": community.created_by_user?.username || community.created_by || 'Herkesler Soruyor'
                        }
                    }}
                />
            )}
            <div className="h-[calc(100vh-100px)] p-2">
                {token && serverUrl ? (
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

                        {community?.type === 'voice' ? (
                            <VoiceRoomUI
                                community={community}
                                role={role}
                                onLeave={handleDisconnect}
                                onRaiseHand={handleRaiseHand}
                                onToggleChat={() => setIsChatOpen(!isChatOpen)}
                            />
                        ) : (
                            <TextRoomUI
                                community={community}
                                onLeave={handleDisconnect}
                            />
                        )}
                        <InRoomChat
                            communityId={communityUuidRef.current || uuid}
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                        />
                    </LiveKitRoom>
                ) : (
                    <div>Token hatası.</div>
                )}
            </div>
        </MainLayout>
    );
};

export default RoomPage;
