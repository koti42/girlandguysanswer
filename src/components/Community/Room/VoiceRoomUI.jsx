import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    RoomAudioRenderer,
    ControlBar,
    useRoomContext,
    useParticipants,
    useIsSpeaking,
    useLocalParticipant
} from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { FaHandPaper, FaMicrophoneSlash, FaCommentAlt, FaUserSlash, FaMicrophone, FaListUl, FaCheck, FaTimes, FaUserPlus } from 'react-icons/fa';
import { communityAPI, usersAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';
import { echo } from '../../../services/echo';
import { useAuth } from '../../../context/AuthContext';

const SpeakerAvatar = ({ participant, onClick, isHost }) => {
    const isSpeaking = useIsSpeaking(participant, { threshold: -60 });
    const metadata = JSON.parse(participant.metadata || '{}');
    
    const [showSpeaking, setShowSpeaking] = React.useState(false);
    
    React.useEffect(() => {
        if (isSpeaking) {
            setShowSpeaking(true);
        } else {
            const timer = setTimeout(() => {
                setShowSpeaking(false);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [isSpeaking]);
    
    const isMicActive = participant.isMicrophoneEnabled && !participant.isMicrophoneMuted;
    const shouldShowSpeaking = isMicActive && (isSpeaking || showSpeaking);

    return (
        <div
            className="relative group cursor-pointer flex flex-col items-center"
            onClick={() => onClick(participant)}
        >
            <div className={`w-24 h-24 rounded-full overflow-hidden border-4 transition-all duration-300 ${shouldShowSpeaking ? 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'border-transparent'}`}>
                {metadata.avatar ? (
                    <img
                        src={metadata.avatar}
                        alt={participant.name}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center text-3xl font-bold text-gray-400">
                        {participant.name?.[0]?.toUpperCase()}
                    </div>
                )}
            </div>

            <div className="text-center mt-2">
                <p className="text-sm font-bold truncate max-w-[100px] text-white">{participant.name || participant.identity}</p>
                <p className="text-xs text-coral">
                    {isHost ? '👑 Host' : 'Konuşmacı'}
                </p>
            </div>
        </div>
    );
};

const VoiceRoomUI = ({ community, onRaiseHand, onLeave, onToggleChat, role: initialRole }) => {
    const room = useRoomContext();
    const participants = useParticipants();
    const { localParticipant } = useLocalParticipant();
    const { user } = useAuth();
    const [selectedParticipant, setSelectedParticipant] = useState(null);
    const [showRequests, setShowRequests] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteUsername, setInviteUsername] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [raisedHandUsers, setRaisedHandUsers] = useState(new Set());
    const [participantUserMap, setParticipantUserMap] = useState(new Map());
    const [userRoles, setUserRoles] = useState(new Map());
    const [kickedUsers, setKickedUsers] = useState(new Set());
    const [canPublish, setCanPublish] = useState(false);

    const channelRef = useRef(null);

    useEffect(() => {
        if (!room || !localParticipant) return;

        const handlePermissionChange = (prevPermissions) => {
            const canPublishNow = localParticipant.permissions?.canPublish ?? false;
            
            setCanPublish(canPublishNow);
            
            if (user?.id) {
                if (canPublishNow) {
                    const currentRole = userRoles.get(user.id);
                    const newRole = currentRole === 'host' ? 'host' : 'speaker';
                    
                    setUserRoles(prev => {
                        const newMap = new Map(prev);
                        newMap.set(user.id, newRole);
                        return newMap;
                    });
                    
                    toast.success('Mikrofon yetkisi aktif! Sahneye alındınız.');
                } else {
                    setUserRoles(prev => {
                        const newMap = new Map(prev);
                        newMap.set(user.id, 'listener');
                        return newMap;
                    });
                }
            }
        };

        room.on(RoomEvent.ParticipantPermissionsChanged, handlePermissionChange);

        const initialCanPublish = localParticipant.permissions?.canPublish ?? false;
        setCanPublish(initialCanPublish);
        
        if (user?.id && initialCanPublish) {
            const currentRole = userRoles.get(user.id);
            const newRole = currentRole === 'host' ? 'host' : 'speaker';
            
            setUserRoles(prev => {
                const newMap = new Map(prev);
                newMap.set(user.id, newRole);
                return newMap;
            });
        }

        return () => {
            room.off(RoomEvent.ParticipantPermissionsChanged, handlePermissionChange);
        };
    }, [room, localParticipant, user, userRoles]);

    useEffect(() => {
        if (!room) return;

        const handleParticipantConnected = (participant) => {
            if (participant.identity === room.localParticipant?.identity) return;

            try {
                const metadata = JSON.parse(participant.metadata || '{}');
                const username = metadata.username || participant.name || 'Birisi';
                toast.success(`${username} odaya katıldı`, { icon: '👋', duration: 3000 });
            } catch (e) {
                toast.success('Yeni bir kullanıcı odaya katıldı', { icon: '👋', duration: 3000 });
            }
        };

        const handleParticipantDisconnected = (participant) => {
            if (participant.identity === room.localParticipant?.identity) return;

            try {
                const metadata = JSON.parse(participant.metadata || '{}');
                const username = metadata.username || participant.name || 'Birisi';
                toast(`${username} odadan ayrıldı`, { icon: '👋', duration: 3000 });
            } catch (e) {
                toast('Bir kullanıcı odadan ayrıldı', { icon: '👋', duration: 3000 });
            }
        };

        room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
        room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);

        return () => {
            room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
            room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
        };
    }, [room]);

    const currentRole = useMemo(() => {
        if (!room?.localParticipant || !user) return initialRole;
        
        const localParticipant = room.localParticipant;
        const userId = user.id;
        
        if (userRoles.has(userId)) {
            return userRoles.get(userId);
        }
        
        try {
            const metadata = JSON.parse(localParticipant.metadata || '{}');
            if (metadata.role) return metadata.role;
        } catch { }
        
        return initialRole;
    }, [room?.localParticipant, user, userRoles, initialRole]);
    useEffect(() => {
        if (!community?.uuid) return;

        const syncStateFromParticipants = (activeParticipants) => {
            if (!activeParticipants) return;

            const newRaisedHands = new Set();
            const newIdentityToUserId = new Map();
            const newRoles = new Map();

            activeParticipants.forEach(participant => {
                const userId = participant.user_id || participant.id;

                if (userId) {
                    if (participant.identity) newIdentityToUserId.set(participant.identity, userId);
                    if (participant.name) newIdentityToUserId.set(participant.name, userId);
                    if (participant.username) newIdentityToUserId.set(participant.username, userId);

                    if (participant.raised_hand === true) {
                        newRaisedHands.add(userId);
                    }

                    if (participant.role) {
                        newRoles.set(userId, participant.role);
                    }
                }
            });

            setRaisedHandUsers(newRaisedHands);
            setParticipantUserMap(newIdentityToUserId);
            setUserRoles(newRoles);
        };

        if (community.active_participants) {
            syncStateFromParticipants(community.active_participants);
        }
    }, [community?.uuid]);

    useEffect(() => {
        if (!community?.uuid) return;

        const channelName = `community.${community.uuid}`;
        const channel = echo.private(channelName);

        channel.listen('.hand.raised', (data) => {
            const { user_id, raised_hand } = data;
            if (!user_id) return;

            setRaisedHandUsers(prev => {
                const newSet = new Set(prev);
                if (raised_hand === true) {
                    newSet.add(user_id);
                } else {
                    newSet.delete(user_id);
                }
                return newSet;
            });
        });

        channel.listen('.role.changed', (data) => {
            const { user_id, role: newRole } = data;
            if (!user_id) return;

            setUserRoles(prev => {
                const newMap = new Map(prev);
                newMap.set(user_id, newRole);
                return newMap;
            });

            if (newRole === 'speaker') {
                setRaisedHandUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(user_id);
                    return newSet;
                });
            }
        });

        channel.listen('.participant.kicked', (data) => {
            const { user_id } = data;
            if (!user_id) return;

            setKickedUsers(prev => {
                const newSet = new Set(prev);
                newSet.add(user_id);
                return newSet;
            });

            setRaisedHandUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(user_id);
                return newSet;
            });
        });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                echo.leave(channelName);
                channelRef.current = null;
            }
        };
    }, [community?.uuid]);

    const getUserIdFromParticipant = (participant) => {
        if (!participant) return null;

        try {
            const metadata = JSON.parse(participant.metadata || '{}');
            if (metadata.user_id) return metadata.user_id;
        } catch (e) { }

        if (participant.identity && participant.identity.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            return participant.identity;
        }

        if (participant.identity && participantUserMap.has(participant.identity)) {
            return participantUserMap.get(participant.identity);
        }

        if (participant.name && participantUserMap.has(participant.name)) {
            return participantUserMap.get(participant.name);
        }

        return null;
    };

    const getParticipantRole = (participant) => {
        const userId = getUserIdFromParticipant(participant);

        if (userId && userRoles.has(userId)) {
            return userRoles.get(userId);
        }

        try {
            const metadata = JSON.parse(participant.metadata || '{}');
            if (metadata.role) return metadata.role;
        } catch { }

        return 'listener';
    };

    const handleParticipantClick = (participant) => {
        if (currentRole === 'host' && participant.identity !== room.localParticipant.identity) {
            setSelectedParticipant(participant);
        }
    };

    const handleMuteUser = async (pIdentity) => {
        try {
            const p = participants.find(part => part.identity === pIdentity);
            if (!p) { toast.error("Katılımcı bulunamadı"); return; }

            const userId = getUserIdFromParticipant(p);
            if (!userId) { toast.error("Kullanıcı ID bulunamadı"); return; }

            await communityAPI.updateRole(community.uuid, userId, 'listener');

            setUserRoles(prev => new Map(prev).set(userId, 'listener'));

            toast.success("Kullanıcı dinleyici yapıldı");
            setSelectedParticipant(null);
        } catch (e) {
            toast.error("İşlem başarısız");
        }
    };

    const handleMakeSpeaker = async (pIdentity) => {
        try {
            const p = participants.find(part => part.identity === pIdentity);
            if (!p) { toast.error("Katılımcı bulunamadı"); return; }

            const userId = getUserIdFromParticipant(p);
            if (!userId) { toast.error("Kullanıcı ID bulunamadı"); return; }

            await communityAPI.updateRole(community.uuid, userId, 'speaker');

            setUserRoles(prev => new Map(prev).set(userId, 'speaker'));
            setRaisedHandUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });

            toast.success("Kullanıcı konuşmacı yapıldı");
            setSelectedParticipant(null);
            setShowRequests(false);
        } catch (e) {
            toast.error(e.response?.data?.message || "İşlem başarısız");
        }
    };

    const handleLowerHand = async (pIdentity) => {
        try {
            const p = participants.find(part => part.identity === pIdentity);
            if (!p) return;
            const userId = getUserIdFromParticipant(p);
            if (!userId) return;

            await communityAPI.updateRole(community.uuid, userId, 'listener');

            setRaisedHandUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });

            toast.success("El indirildi (Reddedildi)");
            setShowRequests(false);
        } catch (e) {
            toast.error("Hata");
        }
    };

    const handleKickUser = async (pIdentity) => {
        try {
            const p = participants.find(part => part.identity === pIdentity);
            if (!p) { toast.error("Katılımcı bulunamadı"); return; }

            const userId = getUserIdFromParticipant(p);
            if (!userId) { toast.error("Kullanıcı ID bulunamadı"); return; }

            await communityAPI.kickUser(community.uuid, userId);

            setKickedUsers(prev => {
                const newSet = new Set(prev);
                newSet.add(userId);
                return newSet;
            });
            setRaisedHandUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(userId);
                return newSet;
            });

            toast.success("Kullanıcı atıldı");
            setSelectedParticipant(null);
        } catch (e) {
            toast.error(e.response?.data?.message || "İşlem başarısız");
        }
    };

    const handleInviteUser = async () => {
        if (!inviteUsername.trim()) {
            toast.error("Kullanıcı adı gerekli");
            return;
        }

        try {
            setInviteLoading(true);
            const profileRes = await usersAPI.getProfile(inviteUsername.trim());
            const targetUserId = profileRes.data.data.id;

            await communityAPI.inviteUser(community.uuid, targetUserId);
            toast.success(`${inviteUsername} kullanıcısına davet gönderildi`);
            setInviteUsername('');
            setShowInviteModal(false);
        } catch (e) {
            if (e.response?.status === 404) {
                toast.error("Kullanıcı bulunamadı");
            } else {
                toast.error(e.response?.data?.message || "Davet gönderilemedi");
            }
        } finally {
            setInviteLoading(false);
        }
    };

    const activeParticipants = participants.filter(p => {
        const userId = getUserIdFromParticipant(p);
        return !userId || !kickedUsers.has(userId);
    });

    const speakers = activeParticipants.filter(p => {
        const role = getParticipantRole(p);
        return role === 'host' || role === 'speaker';
    });

    const listeners = activeParticipants.filter(p => !speakers.includes(p));

    const raisedHandListeners = listeners.filter(p => {
        const userId = getUserIdFromParticipant(p);
        if (!userId) return false;

        if (raisedHandUsers.has(userId)) return true;

        try {
            const metadata = JSON.parse(p.metadata || '{}');
            return metadata.raised_hand === true;
        } catch { }
        return false;
    });

    const isSelectedSpeaker = selectedParticipant && (() => {
        return getParticipantRole(selectedParticipant) === 'speaker';
    })();

    const isSelectedListener = selectedParticipant && (() => {
        const r = getParticipantRole(selectedParticipant);
        return r === 'listener' || !r;
    })();

    return (
            <div className="flex flex-col h-full bg-gray-900 text-white rounded-2xl overflow-hidden relative">
            <RoomAudioRenderer />

            {showInviteModal && currentRole === 'host' && (
                <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Kullanıcı Davet Et</h3>
                            <button onClick={() => setShowInviteModal(false)}><FaTimes className="text-gray-500" /></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Kullanıcı Adı
                                </label>
                                <input
                                    type="text"
                                    value={inviteUsername}
                                    onChange={(e) => setInviteUsername(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleInviteUser()}
                                    placeholder="kullanici_adi"
                                    className="w-full px-4 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-coral focus:border-transparent text-gray-900 dark:text-white"
                                    autoFocus
                                />
                            </div>

                            <button
                                onClick={handleInviteUser}
                                disabled={inviteLoading || !inviteUsername.trim()}
                                className="w-full py-3 bg-coral hover:bg-orange-600 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {inviteLoading ? 'Gönderiliyor...' : 'Davet Gönder'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showRequests && currentRole === 'host' && (
                <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4" onClick={() => setShowRequests(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col h-[400px]" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-900 dark:text-white text-lg">Söz Hakkı İsteyenler</h3>
                            <button onClick={() => setShowRequests(false)}><FaTimes className="text-gray-500" /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {raisedHandListeners.length === 0 ? (
                                <p className="text-center text-gray-500 mt-10">Bekleyen istek yok.</p>
                            ) : (
                                <div className="space-y-3">
                                    {raisedHandListeners.map(p => (
                                        <div key={p.identity} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden">
                                                    <img
                                                        src={JSON.parse(p.metadata || '{}').avatar}
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                                <span className="font-semibold text-gray-800 dark:text-gray-200 text-sm">{p.name}</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleLowerHand(p.identity)}
                                                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                    title="Reddet"
                                                >
                                                    <FaTimes />
                                                </button>
                                                <button
                                                    onClick={() => handleMakeSpeaker(p.identity)}
                                                    className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 shadow-md"
                                                    title="Söz Hakkı Ver (Konuşmacı Yap)"
                                                >
                                                    <FaCheck />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedParticipant && (
                <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelectedParticipant(null)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden">
                                <img
                                    src={JSON.parse(selectedParticipant.metadata || '{}').avatar || `https://ui-avatars.com/api/?name=${selectedParticipant.name}`}
                                    alt={selectedParticipant.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white text-lg">{selectedParticipant.name}</h3>
                                <p className="text-gray-500 text-sm">Katılımcı Yönetimi</p>
                            </div>
                        </div>

                        <div className="flex flex-col gap-3">
                            {isSelectedSpeaker && (
                                <button
                                    onClick={() => handleMuteUser(selectedParticipant.identity)}
                                    className="flex items-center gap-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-left"
                                >
                                    <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                        <FaMicrophoneSlash />
                                    </div>
                                    <div>
                                        <span className="block font-bold text-gray-900 dark:text-white">Dinleyici Yap (Sustur)</span>
                                        <span className="text-xs text-gray-500">Kullanıcının mikrofonu kapanır, sahneden iner</span>
                                    </div>
                                </button>
                            )}

                            {isSelectedListener && (
                                <button
                                    onClick={() => handleMakeSpeaker(selectedParticipant.identity)}
                                    className="flex items-center gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20 transition-colors text-left"
                                >
                                    <div className="p-2 bg-green-100 text-green-600 rounded-lg">
                                        <FaMicrophone />
                                    </div>
                                    <div>
                                        <span className="block font-bold text-gray-900 dark:text-white">Söz Hakkı Ver (Konuşmacı Yap)</span>
                                        <span className="text-xs text-gray-500">Kullanıcı sahneye alınır ve konuşabilir</span>
                                    </div>
                                </button>
                            )}

                            <button
                                onClick={() => handleKickUser(selectedParticipant.identity)}
                                className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors text-left"
                            >
                                <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                    <FaUserSlash />
                                </div>
                                <div>
                                    <span className="block font-bold text-red-600 dark:text-red-400">Odadan At</span>
                                    <span className="text-xs text-red-400">Kullanıcı odadan uzaklaştırılır</span>
                                </div>
                            </button>
                        </div>

                        <button
                            onClick={() => setSelectedParticipant(null)}
                            className="mt-6 w-full py-3 text-gray-500 font-medium hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            İptal
                        </button>
                    </div>
                </div>
            )}

            <div className="flex-1 p-6 relative bg-gradient-to-b from-gray-800 to-gray-900">
                <h2 className="text-gray-400 text-sm font-bold mb-4 tracking-wider uppercase">Sahne ({speakers.length})</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4 justify-items-center">
                    {speakers.map(participant => (
                        <SpeakerAvatar
                            key={participant.identity}
                            participant={participant}
                            onClick={handleParticipantClick}
                            isHost={getParticipantRole(participant) === 'host'}
                        />
                    ))}

                    {speakers.length === 0 && (
                        <div className="col-span-full text-center text-gray-500 py-10">
                            Sahne boş...
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 p-6 bg-gray-950/50 overflow-y-auto min-h-[200px]">
                <h2 className="text-gray-400 text-sm font-bold mb-4 tracking-wider uppercase">Dinleyiciler ({listeners.length})</h2>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                    {listeners.map(participant => (
                        <div
                            key={participant.identity}
                            className="flex flex-col items-center cursor-pointer"
                            onClick={() => handleParticipantClick(participant)}
                        >
                            <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center relative">
                                {participant.metadata && JSON.parse(participant.metadata).avatar ? (
                                    <img src={JSON.parse(participant.metadata).avatar} className="w-full h-full rounded-full" />
                                ) : (
                                    <span className="font-bold text-gray-400">{participant.name?.[0]}</span>
                                )}

                                {(() => {
                                    const userId = getUserIdFromParticipant(participant);
                                    if (!userId) return null;

                                    let hasRaisedHand = false;

                                    if (raisedHandUsers.has(userId)) hasRaisedHand = true;

                                    if (!hasRaisedHand) {
                                        try {
                                            const metadata = JSON.parse(participant.metadata || '{}');
                                            if (metadata.raised_hand === true) hasRaisedHand = true;
                                        } catch { }
                                    }

                                    return hasRaisedHand ? (
                                        <div className="absolute -top-1 -right-1 bg-yellow-400 text-black p-1 rounded-full animate-bounce">
                                            <FaHandPaper size={10} />
                                        </div>
                                    ) : null;
                                })()}
                            </div>
                            <p className="text-xs text-center mt-1 text-gray-400 truncate w-full">{participant.name}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    {canPublish ? (
                        <ControlBar variation="minimal" controls={{ microphone: true, camera: false, screenShare: false, leave: false }} />
                    ) : (
                        <div className="text-gray-400 text-sm italic px-4">Dinleyici Modu</div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            toast('Yakında eklenecek', { icon: '💬', duration: 3000 });
                        }}
                        className="p-3 rounded-full bg-gray-700 hover:bg-blue-500/20 text-blue-400 transition-colors"
                    >
                        <FaCommentAlt size={18} />
                    </button>

                    {currentRole === 'host' && (
                        <>
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowInviteModal(true);
                                }}
                                className="p-3 rounded-full bg-gray-700 hover:bg-green-600 transition-colors text-white"
                                title="Kullanıcı Davet Et"
                            >
                                <FaUserPlus size={18} />
                            </button>
                            <button
                                onClick={() => setShowRequests(true)}
                                className="relative p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-white"
                                title="Söz İsteyenler"
                            >
                                <FaListUl size={18} />
                                {raisedHandListeners.length > 0 && (
                                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-gray-800 font-bold">
                                        {raisedHandListeners.length}
                                    </span>
                                )}
                            </button>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {!canPublish && currentRole !== 'host' && (
                        <button
                            onClick={onRaiseHand}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white font-medium text-sm flex items-center gap-2 transition-colors"
                        >
                            <FaHandPaper />
                            <span>El Kaldır</span>
                        </button>
                    )}
                    <button
                        onClick={onLeave}
                        className={`px-6 py-2 rounded-full text-white font-bold transition-colors ${currentRole === 'host' ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'}`}
                    >
                        {currentRole === 'host' ? 'Yayını Bitir' : 'Ayrıl'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceRoomUI;
