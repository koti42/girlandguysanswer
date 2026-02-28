import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserSecret, FaEnvelope, FaUserFriends, FaLock, FaGlobe, FaTrash, FaUser } from 'react-icons/fa';
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
        messaging_mode: 'everyone', // everyone, followers
        allow_following: true
    });
    const [deletePassword, setDeletePassword] = useState('');
    const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
    const [isDeletingAccount, setIsDeletingAccount] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [toast, setToast] = useState({ show: false, message: '', type: 'success' });
    const [usernameChangesRemaining, setUsernameChangesRemaining] = useState(null);
    const [newUsername, setNewUsername] = useState('');
    const [usernameSubmitting, setUsernameSubmitting] = useState(false);

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
            } catch (_) { }
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

    useEffect(() => {
        const fetchSettings = async () => {
            if (!user?.username) return;
            try {
                // Fetch current user's settings from /user/me endpoint
                const response = await usersAPI.getMe();

                const userData = response.data.data.user;
                const detail = userData.detail;
                const remaining = response.data.data.username_changes_remaining;
                setUsernameChangesRemaining(remaining !== undefined ? remaining : 3);

                setSettings({
                    is_private: detail.is_private || false,
                    allow_messaging: detail.allow_messaging !== undefined ? detail.allow_messaging : true,
                    messaging_mode: detail.messaging_mode || 'everyone',
                    allow_following: detail.allow_following !== undefined ? detail.allow_following : true
                });
            } catch (error) {
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
                    allow_following: backendSettings.allow_following
                });
            }

            if (user) {
                updateUser({ is_private: newValue });
            }

            showSuccess(response.data.message || `Hesap ${newValue ? 'gizli' : 'herkese açık'} olarak güncellendi.`);
        } catch (error) {
            setSettings(prev => ({ ...prev, is_private: !newValue })); // Revert

            const errorMsg = error.response?.data?.message || 'Gizlilik ayarı güncellenemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
        }
    };

    const handleMessagingToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_messaging: newValue }));
            const response = await usersAPI.updateMessaging({
                allow_messaging: newValue,
                messaging_mode: settings.messaging_mode
            });

            if (response.data.data?.settings) {
                const backendSettings = response.data.data.settings;
                setSettings({
                    is_private: backendSettings.is_private,
                    allow_messaging: backendSettings.allow_messaging,
                    messaging_mode: backendSettings.messaging_mode,
                    allow_following: backendSettings.allow_following
                });
            }

            if (user) {
                updateUser({ allow_messaging: newValue });
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
                messaging_mode: mode
            });
            showSuccess(`Mesaj tercihiniz güncellendi.`);
        } catch (error) {
            setSettings(prev => ({ ...prev, messaging_mode: settings.messaging_mode }));
            const errorMsg = error.response?.data?.message || 'Mesaj modu güncellenemedi. Lütfen tekrar deneyin.';
            showToast(errorMsg, 'error');
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

    const handleFollowingToggle = async (newValue) => {
        try {
            setSettings(prev => ({ ...prev, allow_following: newValue }));
            const response = await usersAPI.updateFollowing(newValue);

            if (response.data.data?.settings) {
                const backendSettings = response.data.data.settings;
                setSettings({
                    is_private: backendSettings.is_private,
                    allow_messaging: backendSettings.allow_messaging,
                    messaging_mode: backendSettings.messaging_mode,
                    allow_following: backendSettings.allow_following
                });
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
