import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserSecret, FaEnvelope, FaUserFriends, FaLock, FaGlobe, FaTrash, FaUser, FaAt } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../services/api';
import { TopUsersWidget } from '../components/Widgets';
import Toast from '../components/Toast';
import ConfirmationModal from '../components/ConfirmationModal';

const Toggle = ({ enabled, onChange, label, description }) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <div className="flex-1 pr-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">{label}</h4>
            {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>}
        </div>
        <button
            onClick={() => onChange(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-coral' : 'bg-gray-200 dark:bg-gray-700'
                }`}
        >
            <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
            />
        </button>
    </div>
);

const SettingsPage = () => {
    const navigate = useNavigate();
    const { user, updateUser, logout } = useAuth();
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState({
        is_private: false,
        allow_messaging: true,
        messaging_mode: 'everyone',
        allow_video_call: true,
        allow_image_messages: true,
        allow_audio_messages: true,
        privacy_hide_online_from_others: false,
        privacy_hide_read_receipts_from_others: false,
        allow_following: true,
        allow_mention_notifications: true,
        profile_color: null,
        profile_color_female: null,
        profile_color_male: null
    });
    const [deletePassword, setDeletePassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [usernameChangesRemaining, setUsernameChangesRemaining] = useState(null);
    const [newUsername, setNewUsername] = useState('');
    const [usernameSubmitting, setUsernameSubmitting] = useState(false);
    const [currentEmail, setCurrentEmail] = useState(user?.email || '');
    const [newEmail, setNewEmail] = useState('');
    const [emailCode, setEmailCode] = useState('');
    const [emailCodeSent, setEmailCodeSent] = useState(false);
    const [emailCodeExpiresAt, setEmailCodeExpiresAt] = useState(null);
    const [emailBlockedUntil, setEmailBlockedUntil] = useState(null);
    const [emailRequestSubmitting, setEmailRequestSubmitting] = useState(false);
    const [emailVerifySubmitting, setEmailVerifySubmitting] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ show: true, message, type });
    };

    const requestAccountDeletion = async () => {
        if (!deletePassword.trim()) {
            showToast('Şifre zorunlu.', 'error');
            return;
        }

        setIsDeletingAccount(true);
        try {
            const res = await usersAPI.requestAccountDeletion(deletePassword);
            const msg = res.data?.message || 'Hesabınız silinmek üzere işaretlendi. 14 gün içinde tekrar giriş yaparak işlemi iptal edebilirsiniz.';

    
            try {
                sessionStorage.setItem('auth_notice', msg);
            } catch (_) { /* sessionStorage / tercih okuması kritik değil */ }
            logout();
            setShowDeleteAccountModal(false);
            setDeletePassword('');
            navigate('/login', { replace: true, state: { notice: msg } });
        } catch (error) {
            const msg = error.response?.data?.message || 'Hesap silme isteği oluşturulamadı.';
            showToast(msg, 'error');
        } finally {
            setIsDeletingAccount(false);
        }
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || newPassword !== newPasswordConfirm) return;
        setIsChangingPassword(true);
        try {
            await usersAPI.changePassword(currentPassword, newPassword, newPasswordConfirm);
            showToast('Şifreniz başarıyla güncellendi.', 'success');
            setCurrentPassword('');
            setNewPassword('');
            setNewPasswordConfirm('');
        } catch (error) {
            const msg = error.response?.data?.message || 'Şifre güncellenirken bir hata oluştu.';
            showToast(msg, 'error');
        } finally {
            setIsChangingPassword(false);
        }
    };

    useEffect(() => {
        const fetchSettings = async () => {
            if (!user?.username) return;
            try {
                // Fetch current user's settings from /user/me endpoint
                const response = await usersAPI.getMe();

                const userData = response.data.data.user;
                const detail = userData.detail;
                const remaining = response.data.data.username_changes_remaining;
                setCurrentEmail(userData.email || user?.email || '');
                setUsernameChangesRemaining(remaining !== undefined ? remaining : 3);

                setSettings({
                    is_private: detail.is_private || false,
                    allow_messaging: detail.allow_messaging !== undefined ? detail.allow_messaging : true,
                    messaging_mode: detail.messaging_mode || 'everyone',
                    allow_video_call: detail.allow_video_call !== undefined ? detail.allow_video_call : true,
                    allow_image_messages: detail.allow_image_messages !== undefined ? detail.allow_image_messages : true,
                    allow_audio_messages: detail.allow_audio_messages !== undefined ? detail.allow_audio_messages : true,
                    privacy_hide_online_from_others: !!detail.privacy_hide_online_from_others,
                    privacy_hide_read_receipts_from_others: !!detail.privacy_hide_read_receipts_from_others,
                    allow_following: detail.allow_following !== undefined ? detail.allow_following : true,
                    allow_mention_notifications: detail.allow_mention_notifications !== undefined ? detail.allow_mention_notifications : true,
                    profile_color: detail.profile_color || null,
                    profile_color_female: detail.profile_color_female || null,
                    profile_color_male: detail.profile_color_male || null
                });
            } catch {
                // sessionStorage / tercih okuması kritik değil
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, [user]);

    const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    const handlePrivacyChange = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, is_private: newValue }));
            const response = await usersAPI.updatePrivacy(newValue);

            if (response.data.data?.settings) {
                const backendSettings = response.data.data.settings;
                setSettings({
                    is_private: backendSettings.is_private,
                    allow_messaging: backendSettings.allow_messaging,
                    messaging_mode: backendSettings.messaging_mode,
                    allow_video_call: backendSettings.allow_video_call ?? true,
                    allow_image_messages: backendSettings.allow_image_messages ?? true,
                    allow_audio_messages: backendSettings.allow_audio_messages ?? true,
                    allow_following: backendSettings.allow_following,
                    allow_mention_notifications: backendSettings.allow_mention_notifications,
                    privacy_hide_online_from_others: backendSettings.privacy_hide_online_from_others ?? false,
                    privacy_hide_read_receipts_from_others: backendSettings.privacy_hide_read_receipts_from_others ?? false,
                    profile_color: backendSettings.profile_color || null,
                    profile_color_female: backendSettings.profile_color_female || null,
                    profile_color_male: backendSettings.profile_color_male || null
                });
            }

            if (user) {
                updateUser({ is_private: newValue });
            }

            showSuccess(response.data.message || `Hesap ${newValue ? 'gizli' : 'herkese açık'} olarak güncellendi.`);
        } catch (error) {
            setSettings(prev => ({ ...prev, is_private: !newValue }));

            const errorMsg = error.response?.data?.message || 'Gizlilik ayarı güncellenemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        }
    };

    const handleMessagingToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_messaging: newValue }));
            const response = await usersAPI.updateMessaging({
                allow_messaging: newValue,
                messaging_mode: settings.messaging_mode,
                allow_video_call: settings.allow_video_call,
                allow_image_messages: settings.allow_image_messages,
                allow_audio_messages: settings.allow_audio_messages,
                privacy_hide_online_from_others: settings.privacy_hide_online_from_others,
                privacy_hide_read_receipts_from_others: settings.privacy_hide_read_receipts_from_others,
            });

            if (response.data.data?.settings) {
                const backendSettings = response.data.data.settings;
                setSettings({
                    is_private: backendSettings.is_private,
                    allow_messaging: backendSettings.allow_messaging,
                    messaging_mode: backendSettings.messaging_mode,
                    allow_video_call: backendSettings.allow_video_call ?? true,
                    allow_image_messages: backendSettings.allow_image_messages ?? true,
                    allow_audio_messages: backendSettings.allow_audio_messages ?? true,
                    allow_following: backendSettings.allow_following,
                    allow_mention_notifications: backendSettings.allow_mention_notifications ?? settings.allow_mention_notifications,
                    privacy_hide_online_from_others: backendSettings.privacy_hide_online_from_others ?? false,
                    privacy_hide_read_receipts_from_others: backendSettings.privacy_hide_read_receipts_from_others ?? false,
                    profile_color: backendSettings.profile_color || null,
                    profile_color_female: backendSettings.profile_color_female || null,
                    profile_color_male: backendSettings.profile_color_male || null
                });
            }

            if (user) {
                updateUser({ allow_messaging: newValue, detail: { ...(user?.detail || {}), allow_messaging: newValue } });
            }

            showSuccess(response.data.message || `Mesajlaşma ${newValue ? 'açıldı' : 'kapatıldı'}.`);
        } catch (error) {
            setSettings(prev => ({ ...prev, allow_messaging: !newValue }));

            const errorMsg = error.response?.data?.message || 'Mesaj ayarı güncellenemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        }
    };

    const handleMessagingModeChange = async (mode) => {
        if (mode === settings.messaging_mode) return;
        try {
            setSettings(prev => ({ ...prev, messaging_mode: mode }));
            await usersAPI.updateMessaging({
                allow_messaging: settings.allow_messaging,
                messaging_mode: mode,
                allow_video_call: settings.allow_video_call,
                allow_image_messages: settings.allow_image_messages,
                allow_audio_messages: settings.allow_audio_messages,
                privacy_hide_online_from_others: settings.privacy_hide_online_from_others,
                privacy_hide_read_receipts_from_others: settings.privacy_hide_read_receipts_from_others,
            });
            showSuccess(`Mesaj tercihiniz güncellendi.`);
        } catch (error) {
            setSettings(prev => ({ ...prev, messaging_mode: settings.messaging_mode }));
            const errorMsg = error.response?.data?.message || 'Mesaj modu güncellenemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        }
    };

    const handleMessagingPrivacyToggle = async (key, newValue) => {
        if (settings[key] === newValue) return;
        const prev = settings;
        const next = { ...settings, [key]: newValue };
        try {
            setSettings(next);
            await usersAPI.updateMessaging({
                allow_messaging: next.allow_messaging,
                messaging_mode: next.messaging_mode,
                allow_video_call: next.allow_video_call,
                allow_image_messages: next.allow_image_messages,
                allow_audio_messages: next.allow_audio_messages,
                privacy_hide_online_from_others: next.privacy_hide_online_from_others,
                privacy_hide_read_receipts_from_others: next.privacy_hide_read_receipts_from_others,
            });
            showSuccess('Mesajlaşma gizliliği güncellendi.');
        } catch (error) {
            setSettings(prev);
            showToast(error.response?.data?.message || 'Ayar güncellenemedi.', 'error');
        }
    };

    const handleMessagingCapabilityToggle = async (key, newValue, successText) => {
        const prev = settings;
        const next = { ...settings, [key]: newValue };
        try {
            setSettings(next);
            await usersAPI.updateMessaging({
                allow_messaging: next.allow_messaging,
                messaging_mode: next.messaging_mode,
                allow_video_call: next.allow_video_call,
                allow_image_messages: next.allow_image_messages,
                allow_audio_messages: next.allow_audio_messages,
                privacy_hide_online_from_others: next.privacy_hide_online_from_others,
                privacy_hide_read_receipts_from_others: next.privacy_hide_read_receipts_from_others,
            });
            updateUser({ [key]: newValue, detail: { ...(user?.detail || {}), [key]: newValue } });
            showSuccess(successText);
        } catch (error) {
            setSettings(prev);
            showToast(error.response?.data?.message || 'Ayar güncellenemedi.', 'error');
        }
    };

    const handleUsernameChange = async () => {
        const value = (newUsername || '').trim();
        if (value.length < 2) {
            showToast('Kullanıcı adı en az 2 karakter olmalıdır.', 'error');
            return;
        }
        if (value === user?.username) {
            showToast('Yeni kullanıcı adı mevcut adınızdan farklı olmalıdır.', 'error');
            return;
        }
        if (usernameChangesRemaining !== null && usernameChangesRemaining <= 0) {
            showToast('Kullanıcı adı değiştirme hakkınız kalmadı.', 'error');
            return;
        }
        setUsernameSubmitting(true);
        try {
            const res = await usersAPI.changeUsername(value);
            const updatedUser = res.data?.data?.user;
            if (updatedUser?.username) {
                updateUser({ username: updatedUser.username });
            }
            setNewUsername('');
            setUsernameChangesRemaining(prev => (prev != null ? prev - 1 : 0));
            showSuccess(res.data?.message || 'Kullanıcı adı güncellendi.');
        } catch (err) {
            const msg = err.response?.data?.message || 'Kullanıcı adı güncellenemedi.';
            showToast(msg, 'error');
        } finally {
            setUsernameSubmitting(false);
        }
    };

    const handleMentionToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_mention_notifications: newValue }));
            const response = await usersAPI.updateMention(newValue);

            if (response.data.data?.settings) {
                const backendSettings = response.data.data.settings;
                setSettings(prev => ({
                    ...prev,
                    allow_mention_notifications: backendSettings.allow_mention_notifications
                }));
            }
            showSuccess(response.data.message || 'Etiketleme ayarı güncellendi.');
        } catch (error) {
            setSettings(prev => ({ ...prev, allow_mention_notifications: !newValue }));
            showToast(error.response?.data?.message || 'Etiketleme ayarı güncellenemedi.', 'error');
        }
    };

    const isEmailBlocked = !!(emailBlockedUntil && new Date(emailBlockedUntil) > new Date());

    const handleRequestEmailCode = async () => {
        const targetEmail = (newEmail || '').trim().toLowerCase();
        if (!targetEmail) {
            showToast('Yeni e-posta adresi zorunludur.', 'error');
            return;
        }
        if (targetEmail === (currentEmail || '').toLowerCase()) {
            showToast('Yeni e-posta mevcut adresinizden farklı olmalıdır.', 'error');
            return;
        }
        if (isEmailBlocked) {
            showToast('E-posta değiştirme şu an kilitli. Lütfen daha sonra tekrar deneyin.', 'error');
            return;
        }

        setEmailRequestSubmitting(true);
        try {
            const res = await usersAPI.requestEmailChangeCode(targetEmail);
            setEmailCodeSent(true);
            setEmailCode('');
            setEmailCodeExpiresAt(res.data?.data?.expires_at || null);
            setEmailBlockedUntil(null);
            showSuccess(res.data?.message || 'Doğrulama kodu gönderildi.');
        } catch (err) {
            const status = err.response?.status;
            if (status === 429) {
                setEmailBlockedUntil(new Date(Date.now() + 60 * 60 * 1000).toISOString());
            }
            showToast(err.response?.data?.message || 'Doğrulama kodu gönderilemedi.', 'error');
        } finally {
            setEmailRequestSubmitting(false);
        }
    };

    const handleVerifyEmailCode = async () => {
        if (!emailCodeSent) {
            showToast('Önce doğrulama kodu istemelisiniz.', 'error');
            return;
        }
        if (!/^\d{6}$/.test((emailCode || '').trim())) {
            showToast('6 haneli kod giriniz.', 'error');
            return;
        }

        setEmailVerifySubmitting(true);
        try {
            const res = await usersAPI.verifyEmailChangeCode((newEmail || '').trim().toLowerCase(), emailCode.trim());
            const updatedUser = res.data?.data?.user;
            const updatedEmail = updatedUser?.email || (newEmail || '').trim().toLowerCase();

            setCurrentEmail(updatedEmail);
            updateUser({ email: updatedEmail });

            setNewEmail('');
            setEmailCode('');
            setEmailCodeSent(false);
            setEmailCodeExpiresAt(null);
            setEmailBlockedUntil(null);

            showSuccess(res.data?.message || 'E-posta adresiniz güncellendi.');
        } catch (err) {
            const status = err.response?.status;
            if (status === 429) {
                setEmailCodeSent(false);
                setEmailCode('');
                setEmailCodeExpiresAt(null);
                setEmailBlockedUntil(new Date(Date.now() + 60 * 60 * 1000).toISOString());
            }
            showToast(err.response?.data?.message || 'Kod doğrulanamadı.', 'error');
        } finally {
            setEmailVerifySubmitting(false);
        }
    };

    const handleFollowingToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_following: newValue }));
            const response = await usersAPI.updateFollowing(newValue);

            if (response.data.data?.settings) {
                const backendSettings = response.data.data.settings;
                setSettings(prev => ({
                    ...prev,
                    is_private: backendSettings.is_private,
                    allow_messaging: backendSettings.allow_messaging,
                    messaging_mode: backendSettings.messaging_mode,
                    allow_video_call: backendSettings.allow_video_call ?? prev.allow_video_call,
                    allow_image_messages: backendSettings.allow_image_messages ?? prev.allow_image_messages,
                    allow_audio_messages: backendSettings.allow_audio_messages ?? prev.allow_audio_messages,
                    allow_following: backendSettings.allow_following
                }));
            }

            if (user) {
                updateUser({ allow_following: newValue });
            }

            showSuccess(response.data.message || `Takip istekleri ${newValue ? 'kabul ediliyor' : 'kapatıldı'}.`);
        } catch (error) {
            setSettings(prev => ({ ...prev, allow_following: !newValue }));

            const errorMsg = error.response?.data?.message || 'Takip ayarı güncellenemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        }
    };

    const handleProfileColorChange = async (gender, color) => {
        const key = gender === 'female' ? 'profile_color_female' : 'profile_color_male';
        try {
            setSettings(prev => ({ ...prev, [key]: color }));
            const payload = { [key]: color || null };
            await usersAPI.updateProfileColor(payload);
            if (user) {
                updateUser({ detail: { ...user.detail, [key]: color } });
            }
            showSuccess('Profil rengi güncellendi.');
        } catch (error) {
            const errorMsg = error.response?.data?.message || 'Profil rengi güncellenemedi.';
            showToast(errorMsg, 'error');
        }
    };

    if (loading) return (
        <MainLayout>
            <div className="flex justify-center p-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
            </div>
        </MainLayout>
    );

    return (
        <>
            {toast.show && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ ...toast, show: false })}
                />
            )}

            <MainLayout sidebar={<TopUsersWidget />}>
                <div className="max-w-2xl mx-auto">
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Hesap Ayarları</h1>

                    {successMessage && (
                        <div className="mb-6 p-4 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl animate-bounce-short text-center">
                            {successMessage}
                        </div>
                    )}

                    {/* Username Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                <FaUser className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Kullanıcı Adı</h2>
                                <p className="text-xs text-gray-500">Kullanıcı adınızı değiştirin (en fazla 3 kez)</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Mevcut kullanıcı adınız: <span className="font-semibold text-gray-800 dark:text-white">@{user?.username}</span>
                            </p>
                            {usernameChangesRemaining !== null && usernameChangesRemaining > 0 ? (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yeni kullanıcı adı</label>
                                        <input
                                            type="text"
                                            value={newUsername}
                                            onChange={(e) => setNewUsername(e.target.value)}
                                            placeholder="Yeni kullanıcı adı (2-30 karakter)"
                                            className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/20"
                                            maxLength={30}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500">{usernameChangesRemaining}/3 değişiklik hakkınız kaldı.</p>
                                    <button
                                        type="button"
                                        onClick={handleUsernameChange}
                                        disabled={usernameSubmitting || !newUsername.trim() || newUsername.trim().length < 2}
                                        className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {usernameSubmitting ? 'Güncelleniyor...' : 'Kullanıcı Adını Değiştir'}
                                    </button>
                                </>
                            ) : (
                                <p className="text-sm text-amber-600 dark:text-amber-400">Kullanıcı adı değiştirme hakkınız kalmadı.</p>
                            )}
                        </div>
                    </div>

                    {/* Profile Color Section - Kadın ve Erkek ayrı */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg text-cyan-600 dark:text-cyan-400">
                                <FaEnvelope className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">E-posta Adresi</h2>
                                <p className="text-xs text-gray-500">Yeni e-posta için 6 haneli doğrulama kodu gerekir.</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Mevcut e-posta adresiniz: <span className="font-semibold text-gray-800 dark:text-white">{currentEmail || '-'}</span>
                            </p>
                            {isEmailBlocked && (
                                <p className="text-sm text-red-600 dark:text-red-400">
                                    Çok fazla hatalı kod denemesi nedeniyle e-posta değiştirme 1 saatliğine kilitli.
                                </p>
                            )}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Yeni e-posta adresi</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="ornek@mail.com"
                                    className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20"
                                    disabled={isEmailBlocked}
                                />
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={handleRequestEmailCode}
                                    disabled={emailRequestSubmitting || !newEmail.trim() || isEmailBlocked}
                                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {emailRequestSubmitting ? 'Kod Gönderiliyor...' : (emailCodeSent ? 'Kodu Tekrar Gönder' : 'Doğrulama Kodu Gönder')}
                                </button>
                                {emailCodeExpiresAt && (
                                    <span className="text-xs text-gray-500">
                                        Kod geçerlilik: {new Date(emailCodeExpiresAt).toLocaleString('tr-TR')}
                                    </span>
                                )}
                            </div>

                            {emailCodeSent && (
                                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">6 haneli doğrulama kodu</label>
                                        <input
                                            type="text"
                                            value={emailCode}
                                            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder="000000"
                                            inputMode="numeric"
                                            className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/20 tracking-[0.2em]"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleVerifyEmailCode}
                                        disabled={emailVerifySubmitting || emailCode.length !== 6 || isEmailBlocked}
                                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {emailVerifySubmitting ? 'Doğrulanıyor...' : 'Kodu Doğrula ve E-postayı Değiştir'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Profile Color Section - Kadın ve Erkek ayrı */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                <FaUser className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Profil Renkleri</h2>
                                <p className="text-xs text-gray-500">Sitedeki tüm sorular, cevaplar, yorumlar, benceler, mesajlar ve profiller senin ekranında bu renklerle görünür (sadece sen görürsün)</p>
                            </div>
                        </div>
                        {[
                            { gender: 'female', label: 'Kadın rengi', defaultHex: '#EC4899', settingsKey: 'profile_color_female' },
                            { gender: 'male', label: 'Erkek rengi', defaultHex: '#3B82F6', settingsKey: 'profile_color_male' },
                        ].map(({ gender, label, defaultHex, settingsKey }) => (
                            <div key={gender} className="mb-6 last:mb-0">
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{label}</h3>
                                <p className="text-xs text-gray-500 mb-2">Seçmezsen varsayılan ({gender === 'female' ? 'pembe' : 'mavi'}) kullanılır</p>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {[
                                        { hex: '#EC4899', label: 'Pembe' },
                                        { hex: '#3B82F6', label: 'Mavi' },
                                        { hex: '#FF6F61', label: 'Coral' },
                                        { hex: '#22C55E', label: 'Yeşil' },
                                        { hex: '#A855F7', label: 'Mor' },
                                        { hex: '#F59E0B', label: 'Turuncu' },
                                        { hex: '#06B6D4', label: 'Cyan' },
                                        { hex: '#EF4444', label: 'Kırmızı' },
                                    ].map(({ hex, label: l }) => (
                                        <button
                                            key={hex}
                                            type="button"
                                            onClick={() => handleProfileColorChange(gender, hex)}
                                            title={l}
                                            className={`w-10 h-10 rounded-full border-2 transition-all hover:scale-110 ${settings[settingsKey] === hex ? 'border-gray-900 dark:border-white ring-2 ring-offset-2 ring-gray-400' : 'border-gray-200 dark:border-gray-600'}`}
                                            style={{ backgroundColor: hex }}
                                        />
                                    ))}
                                </div>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="color"
                                        value={settings[settingsKey] || defaultHex}
                                        onChange={(e) => handleProfileColorChange(gender, e.target.value)}
                                        className="w-12 h-12 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600 bg-transparent"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleProfileColorChange(gender, null)}
                                        className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-400 underline"
                                    >
                                        Varsayılana dön
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Privacy Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                                <FaUserSecret className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Gizlilik</h2>
                                <p className="text-xs text-gray-500">Profilinizin görünürlüğünü yönetin</p>
                            </div>
                        </div>

                        <Toggle
                            label="Gizli Hesap"
                            description="Hesabınız gizli olduğunda, sadece sizi takip edenler paylaşımlarınızı görebilir. Mevcut takipçileriniz etkilenmez."
                            enabled={settings.is_private}
                            onChange={handlePrivacyChange}
                        />
                    </div>

                    {/* Messaging Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mb-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                <FaEnvelope className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Mesajlaşma</h2>
                                <p className="text-xs text-gray-500">Kimlerin size mesaj atabileceğini seçin</p>
                            </div>
                        </div>

                        <Toggle
                            label="Mesajlara İzin Ver"
                            description="Kullanıcıların size özel mesaj göndermesine izin verin."
                            enabled={settings.allow_messaging}
                            onChange={handleMessagingToggle}
                        />

                        {settings.allow_messaging && (
                            <div className="mt-4 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Kimler mesaj atabilir?</p>
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => handleMessagingModeChange('everyone')}
                                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${settings.messaging_mode === 'everyone'
                                            ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                            : 'border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <FaGlobe /> Herkes
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleMessagingModeChange('followers')}
                                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${settings.messaging_mode === 'followers'
                                            ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                            : 'border-gray-200 dark:border-gray-700 text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            <FaUserFriends /> Sadece Takipçiler
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-4">
                            <Toggle
                                label="Görüntülü Arama İzni"
                                description="Kapalıysa görüntülü arama başlatamazsın ve sana da görüntülü arama yapılamaz."
                                enabled={settings.allow_video_call}
                                onChange={(v) => handleMessagingCapabilityToggle('allow_video_call', v, 'Görüntülü arama ayarı güncellendi.')}
                            />
                            <Toggle
                                label="Fotoğraf Gönderimine İzin Ver"
                                description="Kapalıysa mesaj içinde fotoğraf gönderemezsin ve sana fotoğraf gönderilemez."
                                enabled={settings.allow_image_messages}
                                onChange={(v) => handleMessagingCapabilityToggle('allow_image_messages', v, 'Fotoğraf gönderim ayarı güncellendi.')}
                            />
                            <Toggle
                                label="Ses Kaydı Gönderimine İzin Ver"
                                description="Kapalıysa ses kaydı gönderemezsin ve sana ses kaydı gönderilemez."
                                enabled={settings.allow_audio_messages}
                                onChange={(v) => handleMessagingCapabilityToggle('allow_audio_messages', v, 'Ses kaydı gönderim ayarı güncellendi.')}
                            />
                        </div>

                        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Mesajlaşma gizliliği</p>
                            <Toggle
                                label="Çevrimiçi durumunu gizle"
                                description="Açıkken karşı taraf sizin çevrimiçi ve son görülme bilginizi görmez."
                                enabled={settings.privacy_hide_online_from_others}
                                onChange={(v) => handleMessagingPrivacyToggle('privacy_hide_online_from_others', v)}
                            />
                            <Toggle
                                label="Okundu bilgisini gönderme"
                                description="Açıkken gönderdiğiniz mesajlarda karşı taraf okundu tiklerini görmez."
                                enabled={settings.privacy_hide_read_receipts_from_others}
                                onChange={(v) => handleMessagingPrivacyToggle('privacy_hide_read_receipts_from_others', v)}
                            />
                        </div>
                    </div>

                    {/* Following Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg text-orange-600 dark:text-orange-400">
                                <FaUserFriends className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Takip Ayarları</h2>
                                <p className="text-xs text-gray-500">Takip isteklerini yönetin</p>
                            </div>
                        </div>

                        <Toggle
                            label="Takip İsteklerine İzin Ver"
                            description="Kullanıcıların sizi takip etmesine veya takip isteği göndermesine izin verin."
                            enabled={settings.allow_following}
                            onChange={handleFollowingToggle}
                        />
                    </div>

                    {/* Etiketleme Section */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                                <FaAt className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Etiketleme</h2>
                                <p className="text-xs text-gray-500">@ ile etiketlendiğinizde bildirim alın</p>
                            </div>
                        </div>

                        <Toggle
                            label="Etiketleme Bildirimleri"
                            description="Soru veya bencede @kullanıcıadı ile etiketlendiğinizde bildirim alırsınız. Kapalıysa etiket bildirimleri gelmez."
                            enabled={settings.allow_mention_notifications}
                            onChange={handleMentionToggle}
                        />
                    </div>

                    {/* Change Password */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mt-6 border border-gray-100 dark:border-gray-700/60">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                                <FaLock className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Şifreyi Değiştir</h2>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Mevcut şifreni doğrulayarak yeni bir şifre belirle.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Mevcut Şifre
                                </label>
                                <input
                                    type="password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Mevcut şifren"
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Yeni Şifre
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="En az 8 karakter"
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Yeni Şifre (Tekrar)
                                </label>
                                <input
                                    type="password"
                                    value={newPasswordConfirm}
                                    onChange={(e) => setNewPasswordConfirm(e.target.value)}
                                    placeholder="Yeni şifreni tekrar gir"
                                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent text-sm"
                                />
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={handleChangePassword}
                                disabled={isChangingPassword || !currentPassword || !newPassword || newPassword !== newPasswordConfirm}
                                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white text-sm font-semibold hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isChangingPassword ? 'Kaydediliyor...' : 'Şifreyi Güncelle'}
                            </button>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Güçlü bir şifre kullan: en az 8 karakter, harf ve rakam karışımı.
                            </p>
                        </div>
                    </div>

                    {/* Delete Account */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-6 mt-6 border border-red-100 dark:border-red-900/30">
                        <div className="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg text-red-600 dark:text-red-400">
                                <FaTrash className="text-xl" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold text-gray-800 dark:text-white">Hesabı Sil</h2>
                                <p className="text-xs text-gray-500">Hesabın 14 gün sonra kalıcı olarak silinir (geri alınabilir süre)</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Şifren
                                </label>
                                <input
                                    type="password"
                                    value={deletePassword}
                                    onChange={(e) => setDeletePassword(e.target.value)}
                                    placeholder="Şifreni gir"
                                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/20 transition-all"
                                />
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowDeleteAccountModal(true)}
                                disabled={!deletePassword.trim()}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Hesabı Silmeyi Başlat
                            </button>
                        </div>
                    </div>

                </div>
            </MainLayout>

            <ConfirmationModal
                isOpen={showDeleteAccountModal}
                onClose={() => setShowDeleteAccountModal(false)}
                onConfirm={requestAccountDeletion}
                title="Hesabı Silmek İstiyor Musun?"
                message="Bu işlem hesabını silinmek üzere işaretler. 14 gün içinde tekrar giriş yaparsan silme iptal edilir. Devam etmek için onayla."
                confirmText={isDeletingAccount ? 'İşleniyor...' : 'Evet, Silmeyi Başlat'}
                cancelText="Vazgeç"
                isDangerous={true}
            />
        </>
    );
};

export default SettingsPage;
