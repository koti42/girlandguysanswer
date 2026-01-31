import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { communityAPI } from '../services/api';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { FaCheck, FaTimes, FaUser } from 'react-icons/fa';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';

const CommunityInvitationsPage = () => {
    const [invitations, setInvitations] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchInvitations();
        
        const handleFocus = () => {
            fetchInvitations();
        };
        
        window.addEventListener('focus', handleFocus);
        
        return () => {
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const fetchInvitations = async () => {
        try {
            const res = await communityAPI.getInvitations();
            const data = res.data?.data || res.data || [];
            setInvitations(Array.isArray(data) ? data : []);
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'Davetler yüklenemedi';
            toast.error(errorMessage);
            setInvitations([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRespond = async (invitationId, status) => {
        try {
            await communityAPI.respondToInvitation(invitationId, status);
            
            if (status === 'accepted') {
                toast.success('Davet kabul edildi');
                const invitation = invitations.find(inv => inv.id === invitationId);
                if (invitation?.community?.uuid) {
                    setTimeout(() => {
                        navigate(`/community/${invitation.community.uuid}`);
                    }, 1000);
                }
            } else {
                toast('Davet reddedildi');
            }
            
            setInvitations(prev => prev.filter(inv => inv.id !== invitationId));
        } catch (error) {
            toast.error(error.response?.data?.message || 'İşlem başarısız');
        }
    };

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                    Topluluk Davetleri
                </h1>

                {loading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                    </div>
                ) : invitations.length === 0 ? (
                    <div className="text-center py-20 text-gray-500">
                        <FaUser size={48} className="mx-auto mb-4 opacity-50" />
                        <p className="text-lg">Bekleyen davet yok</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {invitations.map(invitation => (
                            <div
                                key={invitation.id}
                                className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-4 flex-1">
                                        <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
                                            {invitation.inviter?.avatar ? (
                                                <img
                                                    src={invitation.inviter.avatar}
                                                    alt={invitation.inviter.username}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <FaUser className="text-gray-400" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">
                                                {invitation.community?.title || 'Bilinmeyen Oda'}
                                            </h3>
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                                <span className="font-semibold">{invitation.inviter?.username || 'Birisi'}</span> sizi bu odaya davet etti
                                            </p>
                                            {invitation.community?.description && (
                                                <p className="text-sm text-gray-500 dark:text-gray-500 mb-2">
                                                    {invitation.community.description}
                                                </p>
                                            )}
                                            <p className="text-xs text-gray-400">
                                                {formatDistanceToNow(new Date(invitation.created_at), { addSuffix: true, locale: tr })}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <button
                                            onClick={() => handleRespond(invitation.id, 'accepted')}
                                            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                        >
                                            <FaCheck />
                                            Kabul
                                        </button>
                                        <button
                                            onClick={() => handleRespond(invitation.id, 'rejected')}
                                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                                        >
                                            <FaTimes />
                                            Reddet
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default CommunityInvitationsPage;
