import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserSecret, FaEnvelope, FaUserFriends, FaLock, FaGlobe, FaTrash, FaUser, FaBell, FaMagic, FaUniversalAccess, FaCheck, FaPalette } from 'react-icons/fa';
import { normalizeAvatarUrl } from '../utils/avatarUrl';
import { InterestChips } from '../components/InterestPicker';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { isAccessibilityOn } from '../utils/accessibility';
import { usersAPI, categoriesAPI } from '../services/api';
import { TopUsersWidget } from '../components/Widgets';
import Toast from '../components/Toast';
import ConfirmationModal from '../components/ConfirmationModal';

const INPUT = 'w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50/60 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:bg-white focus:border-coral focus:outline-none focus:ring-4 focus:ring-coral/15 disabled:opacity-60 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700/60 dark:text-white dark:focus:bg-gray-700';
const BTN_PRIMARY = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-coral to-brand-pink px-5 text-sm font-bold text-white shadow-[0_10px_25px_-10px_rgba(231,71,152,0.7)] transition-all hover:shadow-[0_14px_30px_-10px_rgba(231,71,152,0.8)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none';
const BTN_SUCCESS = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed';
const BTN_GHOST = 'inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-200';

const COLOR_PRESETS = [
    { hex: '#EC4899', label: 'Pembe' },
    { hex: '#3B82F6', label: 'Mavi' },
    { hex: '#FF6F61', label: 'Coral' },
    { hex: '#22C55E', label: 'Yeşil' },
    { hex: '#A855F7', label: 'Mor' },
    { hex: '#F59E0B', label: 'Turuncu' },
    { hex: '#06B6D4', label: 'Cyan' },
    { hex: '#EF4444', label: 'Kırmızı' },
];

// Sol gezinti (masaüstü) / yatay çipler (mobil). id'ler kartların id'siyle birebir.
const SECTIONS = [
    { id: 'hesap', label: 'Hesap', icon: <FaUser />, tint: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300' },
    { id: 'gorunum', label: 'Profil Renkleri', icon: <FaPalette />, tint: 'bg-pink-100 text-pink-600 dark:bg-pink-900/40 dark:text-pink-300' },
    { id: 'gizlilik', label: 'Gizlilik ve Takip', icon: <FaUserSecret />, tint: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300' },
    { id: 'mesajlasma', label: 'Mesajlaşma', icon: <FaEnvelope />, tint: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300' },
    { id: 'bildirimler', label: 'Bildirimler', icon: <FaBell />, tint: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300' },
    { id: 'erisilebilirlik', label: 'Erişilebilirlik', icon: <FaUniversalAccess />, tint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300' },
    { id: 'ilgi-alanlari', label: 'İlgi Alanları', icon: <FaMagic />, tint: 'bg-blue-soft text-brand-blue dark:bg-blue-900/40 dark:text-blue-300' },
    { id: 'guvenlik', label: 'Şifre', icon: <FaLock />, tint: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300' },
    { id: 'hesabi-sil', label: 'Hesabı Sil', icon: <FaTrash />, tint: 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300', danger: true },
];

/* Ayar kartı: renkli ikon, başlık, açıklama; id ile gezintiden gelen bağlantı buraya kaydırır. */
const SettingsCard = ({ id, icon, tint, title, subtitle, danger = false, hidden = false, children }) => hidden ? null : (
    <section
        id={id}
        role="tabpanel"
        aria-labelledby={`tab-${id}`}
        className={`scroll-mt-24 rounded-3xl border bg-white p-5 sm:p-6 shadow-[0_12px_40px_-24px_rgba(27,37,89,0.35)] dark:bg-gray-800 ${danger ? 'border-red-200/80 dark:border-red-900/40' : 'border-gray-100 dark:border-gray-700/70'}`}
    >
        <header className="mb-4 flex items-start gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${tint}`} aria-hidden="true">{icon}</span>
            <div className="min-w-0">
                <h2 id={`${id}-baslik`} className="text-lg font-extrabold tracking-tight text-gray-900 dark:text-white">{title}</h2>
                {subtitle && <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{subtitle}</p>}
            </div>
        </header>
        {children}
    </section>
);

const SubHeading = ({ children }) => (
    <p className="pt-5 pb-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{children}</p>
);

const Field = ({ label, htmlFor, children }) => (
    <div>
        <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</label>
        {children}
    </div>
);

const SummaryChip = ({ icon, text }) => (
    <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur ring-1 ring-white/25">
        <span aria-hidden="true">{icon}</span>{text}
    </span>
);

const Toggle = ({ enabled, onChange, label, description }) => {
    const id = React.useId();
    return (
        <div className="flex items-center justify-between gap-4 py-4 border-b border-gray-100 dark:border-gray-700 last:border-0">
            <div className="min-w-0 flex-1">
                <label htmlFor={id} className="block cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">{label}</label>
                {description && <p id={`${id}-aciklama`} className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{description}</p>}
            </div>
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={!!enabled}
                aria-describedby={description ? `${id}-aciklama` : undefined}
                onClick={() => onChange(!enabled)}
                className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-coral/30 ${enabled ? 'bg-gradient-to-r from-coral to-brand-pink' : 'bg-gray-200 dark:bg-gray-600'}`}
            >
                <span className="sr-only">{enabled ? 'Açık' : 'Kapalı'}</span>
                <span
                    className={`pointer-events-none flex h-6 w-6 transform items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ${enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                >
                    {enabled && <FaCheck className="text-[9px] text-brand-pink" aria-hidden="true" />}
                </span>
            </button>
        </div>
    );
};

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
        allow_ticket_messages: true,
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
                setNotifPrefs(response.data.data.notification_preferences || {});
                setInterestIds((response.data.data.interests || []).map((c) => c.id));
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
                    allow_ticket_messages: detail.allow_ticket_messages !== undefined ? !!detail.allow_ticket_messages : true,
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
                    allow_ticket_messages: backendSettings.allow_ticket_messages ?? settings.allow_ticket_messages,
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
                allow_ticket_messages: settings.allow_ticket_messages,
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
                    allow_ticket_messages: backendSettings.allow_ticket_messages ?? settings.allow_ticket_messages,
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
                allow_ticket_messages: settings.allow_ticket_messages,
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
                allow_ticket_messages: next.allow_ticket_messages,
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
                allow_ticket_messages: next.allow_ticket_messages,
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

    // Bildirim tercihleri (sunucu: NotificationPreferences::KEYS ile birebir)
    const NOTIF_KEYS = [
        ['answer_created', 'Soruma cevap gelince', 'Sorduğun soruya yeni bir cevap yazıldığında.'],
        ['comment_created', 'Soruma / cevabıma yorum gelince', 'İçeriğine yorum yapıldığında.'],
        ['comment_reply', 'Yorumuma yanıt gelince', 'Bir yorumuna yanıt yazıldığında.'],
        ['best_answer', 'Cevabım en iyi görüş seçilince', 'Soru sahibi cevabını en iyi görüş seçtiğinde.'],
        ['followed', 'Yeni takipçi ve takip istekleri', 'Biri seni takip ettiğinde ya da istek gönderdiğinde.'],
        ['followed_user_question', 'Takip ettiğim biri soru sorunca', 'Takip ettiğin üyeler yeni soru paylaştığında.'],
        ['push_enabled', 'Anlık (push) bildirimler', 'Kapalıysa telefona/tarayıcıya anlık bildirim gitmez; uygulama içi bildirimler kalır.'],
    ];
    const [notifPrefs, setNotifPrefs] = useState({});
    const [interestIds, setInterestIds] = useState([]);
    const [savedInterestIds, setSavedInterestIds] = useState(null);
    const [allCategories, setAllCategories] = useState([]);
    const [interestSaving, setInterestSaving] = useState(false);
    useEffect(() => {
        categoriesAPI.getAll().then((r) => setAllCategories(r.data?.data?.categories || [])).catch(() => {});
    }, []);
    useEffect(() => { if (savedInterestIds === null && interestIds.length) setSavedInterestIds(interestIds); }, [interestIds, savedInterestIds]);

    // Erişilebilirlik modu: sunucuda saklanır (mobil uygulama da aynı ayarı kullanır).
    // Sekmeli bölümler: yalnız seçili kart görünür; #hash ile derin bağlantı korunur.
    const [activeSection, setActiveSection] = useState(() => {
        const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
        return SECTIONS.some((x) => x.id === h) ? h : SECTIONS[0].id;
    });
    useEffect(() => {
        const onHash = () => {
            const h = window.location.hash.replace('#', '');
            if (SECTIONS.some((x) => x.id === h)) setActiveSection(h);
        };
        window.addEventListener('hashchange', onHash);
        return () => window.removeEventListener('hashchange', onHash);
    }, []);
    const [a11yMode, setA11yMode] = useState(() => isAccessibilityOn(user));
    useEffect(() => { setA11yMode(isAccessibilityOn(user)); }, [user]);
    const handleAccessibilityToggle = async (value) => {
        const prev = a11yMode;
        setA11yMode(value);
        try {
            await usersAPI.updateAccessibility(value);
            updateUser({ accessibility_mode: value, detail: { ...(user?.detail || {}), accessibility_mode: value } });
            showSuccess(value ? 'Erişilebilirlik modu açıldı.' : 'Erişilebilirlik modu kapatıldı.');
        } catch (error) {
            setA11yMode(prev);
            showToast(error.response?.data?.message || 'Ayar güncellenemedi.', 'error');
        }
    };

    const handleNotifPrefToggle = async (key, value) => {
        const prev = notifPrefs;
        setNotifPrefs((p) => ({ ...p, [key]: value }));
        try {
            const r = await usersAPI.updateNotificationPreferences({ [key]: value });
            if (r.data?.data?.notification_preferences) setNotifPrefs(r.data.data.notification_preferences);
            showSuccess('Bildirim tercihi güncellendi.');
        } catch (error) {
            setNotifPrefs(prev);
            showToast(error.response?.data?.message || 'Tercih güncellenemedi.', 'error');
        }
    };

    const saveInterests = async () => {
        setInterestSaving(true);
        try {
            const r = await usersAPI.updateInterests(interestIds);
            const ids = (r.data?.data?.interests || []).map((c) => c.id);
            setInterestIds(ids); setSavedInterestIds(ids);
            showSuccess('İlgi alanların kaydedildi.');
        } catch (error) {
            showToast(error.response?.data?.message || 'Kaydedilemedi.', 'error');
        } finally { setInterestSaving(false); }
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
            <div className="max-w-5xl mx-auto animate-pulse" aria-busy="true" aria-label="Ayarlar yükleniyor">
                <div className="h-40 rounded-3xl bg-gray-200/70 dark:bg-gray-800 mb-6" />
                <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
                    <div className="hidden lg:block h-72 rounded-2xl bg-gray-200/70 dark:bg-gray-800" />
                    <div className="space-y-4">
                        {[0, 1, 2].map((i) => <div key={i} className="h-40 rounded-2xl bg-gray-200/70 dark:bg-gray-800" />)}
                    </div>
                </div>
            </div>
        </MainLayout>
    );

    const showTab = (id) => {
        setActiveSection(id);
        try {
            window.history.replaceState(null, '', `#${id}`);
        } catch { /* yoksay */ }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const messagingSummary = !settings.allow_messaging ? 'Mesajlar kapalı' : settings.messaging_mode === 'followers' ? 'Yalnız takipçiler' : 'Herkes yazabilir';
    const initials = (user?.name || user?.username || '?').trim().slice(0, 1).toUpperCase();

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
                <div className="max-w-5xl mx-auto">
                    {/* Üst kart */}
                    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF6B6B] via-[#F0568A] to-[#8B5CF6] text-white p-6 sm:p-8 mb-6 shadow-[0_20px_50px_-20px_rgba(240,86,138,0.55)]">
                        <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
                            <div className="h-20 w-20 shrink-0 rounded-2xl bg-white/15 ring-4 ring-white/30 overflow-hidden flex items-center justify-center text-3xl font-black backdrop-blur">
                                {user?.avatar ? <img src={normalizeAvatarUrl(user.avatar)} alt="" className="h-full w-full object-cover" /> : initials}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Hesap Ayarları</p>
                                <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight truncate">{user?.name || user?.username}</h1>
                                <p className="text-white/80 text-sm">@{user?.username}{currentEmail ? ` · ${currentEmail}` : ''}</p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <SummaryChip icon={<FaUserSecret />} text={settings.is_private ? 'Gizli hesap' : 'Herkese açık hesap'} />
                                    <SummaryChip icon={<FaEnvelope />} text={messagingSummary} />
                                    <SummaryChip icon={<FaUniversalAccess />} text={a11yMode ? 'Erişilebilirlik açık' : 'Erişilebilirlik kapalı'} />
                                </div>
                            </div>
                        </div>
                    </section>

                    {successMessage && (
                        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:border-emerald-800/50 dark:bg-emerald-900/20 dark:text-emerald-200" role="status">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white"><FaCheck className="text-xs" /></span>
                            {successMessage}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6 items-start">
                        {/* Bölüm gezintisi */}
                        <nav aria-label="Ayar bölümleri" className="lg:sticky lg:top-24">
                            <div role="tablist" aria-orientation="vertical" className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0 -mx-1 px-1">
                                {SECTIONS.map((s) => {
                                    const active = activeSection === s.id;
                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            role="tab"
                                            id={`tab-${s.id}`}
                                            aria-selected={active}
                                            aria-controls={s.id}
                                            onClick={() => showTab(s.id)}
                                            className={`shrink-0 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition-all whitespace-nowrap border text-left ${active
                                                ? (s.danger ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-gray-900 border-gray-900 text-white shadow-md dark:bg-white dark:border-white dark:text-gray-900')
                                                : s.danger
                                                    ? 'text-red-600 border-red-100 bg-red-50/60 hover:bg-red-50 dark:text-red-300 dark:border-red-900/40 dark:bg-red-900/10'
                                                    : 'text-gray-600 border-gray-100 bg-white hover:bg-gray-50 hover:text-gray-900 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:text-white'}`}
                                        >
                                            <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${active ? 'bg-white/20 text-current' : s.tint}`}>{s.icon}</span>
                                            {s.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </nav>

                        <div className="space-y-6 min-w-0">
                            {/* ───── Hesap ───── */}
                            <SettingsCard id="hesap" hidden={activeSection !== 'hesap'} icon={<FaUser />} tint="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300" title="Hesap" subtitle="Kullanıcı adın ve e-posta adresin">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-bold text-gray-800 dark:text-white">Kullanıcı adı</h3>
                                            <span className="text-[11px] font-semibold text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                                {usernameChangesRemaining !== null ? `${usernameChangesRemaining}/3 hak` : '—'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3">Şu an <span className="font-semibold text-gray-800 dark:text-white">@{user?.username}</span></p>
                                        {usernameChangesRemaining !== null && usernameChangesRemaining > 0 ? (
                                            <div className="space-y-3">
                                                <Field label="Yeni kullanıcı adı" htmlFor="yeni-kullanici-adi">
                                                    <input
                                                        id="yeni-kullanici-adi"
                                                        type="text"
                                                        value={newUsername}
                                                        onChange={(e) => setNewUsername(e.target.value)}
                                                        placeholder="2-30 karakter"
                                                        className={INPUT}
                                                        maxLength={30}
                                                    />
                                                </Field>
                                                <button
                                                    type="button"
                                                    onClick={handleUsernameChange}
                                                    disabled={usernameSubmitting || !newUsername.trim() || newUsername.trim().length < 2}
                                                    className={BTN_PRIMARY}
                                                >
                                                    {usernameSubmitting ? 'Güncelleniyor…' : 'Kullanıcı adını değiştir'}
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-amber-600 dark:text-amber-400">Kullanıcı adı değiştirme hakkın kalmadı.</p>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                                        <h3 className="text-sm font-bold text-gray-800 dark:text-white mb-3">E-posta adresi</h3>
                                        <p className="text-xs text-gray-500 mb-3">Şu an <span className="font-semibold text-gray-800 dark:text-white">{currentEmail || '-'}</span></p>
                                        {isEmailBlocked && (
                                            <p className="mb-3 rounded-xl bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-300">
                                                Çok fazla hatalı kod denemesi nedeniyle e-posta değiştirme 1 saatliğine kilitli.
                                            </p>
                                        )}
                                        <div className="space-y-3">
                                            <Field label="Yeni e-posta" htmlFor="yeni-eposta">
                                                <input
                                                    id="yeni-eposta"
                                                    type="email"
                                                    value={newEmail}
                                                    onChange={(e) => setNewEmail(e.target.value)}
                                                    placeholder="ornek@mail.com"
                                                    className={INPUT}
                                                    disabled={isEmailBlocked}
                                                />
                                            </Field>
                                            <div className="flex flex-wrap items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={handleRequestEmailCode}
                                                    disabled={emailRequestSubmitting || !newEmail.trim() || isEmailBlocked}
                                                    className={BTN_PRIMARY}
                                                >
                                                    {emailRequestSubmitting ? 'Kod gönderiliyor…' : (emailCodeSent ? 'Kodu tekrar gönder' : 'Doğrulama kodu gönder')}
                                                </button>
                                                {emailCodeExpiresAt && (
                                                    <span className="text-xs text-gray-500">Son geçerlilik: {new Date(emailCodeExpiresAt).toLocaleString('tr-TR')}</span>
                                                )}
                                            </div>
                                            {emailCodeSent && (
                                                <div className="pt-3 border-t border-gray-100 dark:border-gray-700 space-y-3">
                                                    <Field label="6 haneli doğrulama kodu" htmlFor="eposta-kodu">
                                                        <input
                                                            id="eposta-kodu"
                                                            type="text"
                                                            value={emailCode}
                                                            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                            placeholder="000000"
                                                            inputMode="numeric"
                                                            className={`${INPUT} tracking-[0.35em] text-center font-mono text-lg`}
                                                        />
                                                    </Field>
                                                    <button
                                                        type="button"
                                                        onClick={handleVerifyEmailCode}
                                                        disabled={emailVerifySubmitting || emailCode.length !== 6 || isEmailBlocked}
                                                        className={BTN_SUCCESS}
                                                    >
                                                        {emailVerifySubmitting ? 'Doğrulanıyor…' : 'Kodu doğrula ve e-postayı değiştir'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </SettingsCard>

                            {/* ───── Görünüm ───── */}
                            <SettingsCard id="gorunum" hidden={activeSection !== 'gorunum'} icon={<FaPalette />} tint="bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-300" title="Profil Renkleri" subtitle="Soru, cevap, yorum, mesaj ve profiller senin ekranında bu renklerle görünür; yalnız sen görürsün">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {[
                                        { gender: 'female', label: 'Kadın rengi', defaultHex: '#EC4899', settingsKey: 'profile_color_female' },
                                        { gender: 'male', label: 'Erkek rengi', defaultHex: '#3B82F6', settingsKey: 'profile_color_male' },
                                    ].map(({ gender, label, defaultHex, settingsKey }) => {
                                        const current = settings[settingsKey] || defaultHex;
                                        return (
                                            <div key={gender} className="rounded-2xl border border-gray-100 dark:border-gray-700 p-4">
                                                <div className="flex items-center justify-between mb-3">
                                                    <h3 className="text-sm font-bold text-gray-800 dark:text-white">{label}</h3>
                                                    <span className="flex items-center gap-2 text-xs text-gray-500">
                                                        <span className="h-4 w-4 rounded-full ring-2 ring-white dark:ring-gray-800 shadow" style={{ backgroundColor: current }} aria-hidden="true" />
                                                        {settings[settingsKey] ? current.toUpperCase() : 'Varsayılan'}
                                                    </span>
                                                </div>
                                                <div className="flex flex-wrap gap-2.5 mb-3" role="radiogroup" aria-label={label}>
                                                    {COLOR_PRESETS.map(({ hex, label: l }) => {
                                                        const active = (settings[settingsKey] || defaultHex) === hex;
                                                        return (
                                                            <button
                                                                key={hex}
                                                                type="button"
                                                                role="radio"
                                                                aria-checked={active}
                                                                aria-label={l}
                                                                onClick={() => handleProfileColorChange(gender, hex)}
                                                                title={l}
                                                                className={`relative h-10 w-10 rounded-full transition-transform hover:scale-110 focus-visible:scale-110 ${active ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-gray-800' : ''}`}
                                                                style={{ backgroundColor: hex }}
                                                            >
                                                                {active && <FaCheck className="absolute inset-0 m-auto text-white text-sm drop-shadow" aria-hidden="true" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer">
                                                        <input
                                                            type="color"
                                                            value={current}
                                                            onChange={(e) => handleProfileColorChange(gender, e.target.value)}
                                                            className="h-9 w-9 rounded-lg cursor-pointer border border-gray-200 dark:border-gray-600 bg-transparent p-0.5"
                                                            aria-label={`${label} için özel renk seç`}
                                                        />
                                                        Özel renk
                                                    </label>
                                                    <button type="button" onClick={() => handleProfileColorChange(gender, null)} className={BTN_GHOST}>
                                                        Varsayılana dön
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </SettingsCard>

                            {/* ───── Gizlilik ───── */}
                            <SettingsCard id="gizlilik" hidden={activeSection !== 'gizlilik'} icon={<FaUserSecret />} tint="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300" title="Gizlilik ve Takip" subtitle="Profilinin görünürlüğü ve takip istekleri">
                                <Toggle
                                    label="Gizli hesap"
                                    description="Gizliyken paylaşımlarını yalnız takipçilerin görür. Mevcut takipçilerin etkilenmez."
                                    enabled={settings.is_private}
                                    onChange={handlePrivacyChange}
                                />
                                <Toggle
                                    label="Takip isteklerine izin ver"
                                    description="Kapalıysa kimse seni takip edemez ya da takip isteği gönderemez."
                                    enabled={settings.allow_following}
                                    onChange={handleFollowingToggle}
                                />
                                <Toggle
                                    label="Etiketleme bildirimleri"
                                    description="Soru veya bencede @kullanıcıadı ile etiketlendiğinde bildirim alırsın."
                                    enabled={settings.allow_mention_notifications}
                                    onChange={handleMentionToggle}
                                />
                            </SettingsCard>

                            {/* ───── Mesajlaşma ───── */}
                            <SettingsCard id="mesajlasma" hidden={activeSection !== 'mesajlasma'} icon={<FaEnvelope />} tint="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300" title="Mesajlaşma" subtitle="Kimler yazabilir, neler gönderilebilir">
                                <Toggle
                                    label="Mesajlara izin ver"
                                    description="Kapalıysa kimse sana özel mesaj gönderemez."
                                    enabled={settings.allow_messaging}
                                    onChange={handleMessagingToggle}
                                />
                                {settings.allow_messaging && (
                                    <div className="py-4 border-b border-gray-100 dark:border-gray-700">
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Kimler mesaj atabilir?</p>
                                        <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-700/60 p-1" role="radiogroup" aria-label="Kimler mesaj atabilir">
                                            {[
                                                { key: 'everyone', label: 'Herkes', icon: <FaGlobe /> },
                                                { key: 'followers', label: 'Sadece takipçiler', icon: <FaUserFriends /> },
                                            ].map((opt) => {
                                                const active = settings.messaging_mode === opt.key;
                                                return (
                                                    <button
                                                        key={opt.key}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        onClick={() => handleMessagingModeChange(opt.key)}
                                                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${active ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                                                    >
                                                        {opt.icon} {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                                <Toggle
                                    label="Görüntülü arama"
                                    description="Kapalıysa görüntülü arama başlatamazsın ve sana da yapılamaz."
                                    enabled={settings.allow_video_call}
                                    onChange={(v) => handleMessagingCapabilityToggle('allow_video_call', v, 'Görüntülü arama ayarı güncellendi.')}
                                />
                                <Toggle
                                    label="Fotoğraf gönderimi"
                                    description="Kapalıysa mesajda fotoğraf gönderemezsin ve sana gönderilemez."
                                    enabled={settings.allow_image_messages}
                                    onChange={(v) => handleMessagingCapabilityToggle('allow_image_messages', v, 'Fotoğraf gönderim ayarı güncellendi.')}
                                />
                                <Toggle
                                    label="Ses kaydı gönderimi"
                                    description="Kapalıysa ses kaydı gönderemezsin ve sana gönderilemez."
                                    enabled={settings.allow_audio_messages}
                                    onChange={(v) => handleMessagingCapabilityToggle('allow_audio_messages', v, 'Ses kaydı gönderim ayarı güncellendi.')}
                                />
                                <SubHeading>Mesajlaşma gizliliği</SubHeading>
                                <Toggle
                                    label="Çevrimiçi durumunu gizle"
                                    description="Açıkken karşı taraf çevrimiçi ve son görülme bilgini görmez."
                                    enabled={settings.privacy_hide_online_from_others}
                                    onChange={(v) => handleMessagingPrivacyToggle('privacy_hide_online_from_others', v)}
                                />
                                <Toggle
                                    label="Okundu bilgisini gönderme"
                                    description="Açıkken karşı taraf mesajlarında okundu tiklerini görmez."
                                    enabled={settings.privacy_hide_read_receipts_from_others}
                                    onChange={(v) => handleMessagingPrivacyToggle('privacy_hide_read_receipts_from_others', v)}
                                />
                                <Toggle
                                    label="Mesaj Bileti ile gelen mesajlar"
                                    description="Mesajların kapalıyken bile Oyun Merkezi'nden Mesaj Bileti alan biri sana tek bir mesaj gönderebilir. Kapatırsan bilet kullanılamaz."
                                    enabled={settings.allow_ticket_messages}
                                    onChange={(v) => handleMessagingCapabilityToggle('allow_ticket_messages', v, `Mesaj Bileti ile gelen mesajlar ${v ? 'açıldı' : 'kapatıldı'}.`)}
                                />
                            </SettingsCard>

                            {/* ───── Bildirimler ───── */}
                            <SettingsCard id="bildirimler" hidden={activeSection !== 'bildirimler'} icon={<FaBell />} tint="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300" title="Bildirim Tercihleri" subtitle="Yalnızca ilgilendiğin gelişmeler için bildirim al">
                                {NOTIF_KEYS.map(([key, label, description]) => (
                                    <Toggle key={key} label={label} description={description} enabled={notifPrefs[key] !== false} onChange={(v) => handleNotifPrefToggle(key, v)} />
                                ))}
                            </SettingsCard>

                            {/* ───── Erişilebilirlik ───── */}
                            <SettingsCard id="erisilebilirlik" hidden={activeSection !== 'erisilebilirlik'} icon={<FaUniversalAccess />} tint="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300" title="Erişilebilirlik" subtitle="Ekran okuyucu kullanıyorsan ya da görme güçlüğün varsa">
                                <Toggle
                                    label="Erişilebilirlik modu"
                                    description="Oyunlarda sorular sesli okunur ve okunurken oyun bekler; bilgi yarışmalarında soru süresi iki katına çıkar; yazılar büyür, klavye odağı belirginleşir. Mobil uygulamada da geçerlidir."
                                    enabled={a11yMode}
                                    onChange={handleAccessibilityToggle}
                                />
                                {a11yMode && !('speechSynthesis' in window) && (
                                    <p className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" role="note">Bu tarayıcı sesli okumayı desteklemiyor; sorular yine ekran okuyucuya duyurulur.</p>
                                )}
                            </SettingsCard>

                            {/* ───── İlgi alanları ───── */}
                            <SettingsCard id="ilgi-alanlari" hidden={activeSection !== 'ilgi-alanlari'} icon={<FaMagic />} tint="bg-blue-soft text-brand-blue dark:bg-blue-900/30 dark:text-blue-300" title="İlgi Alanları" subtitle='"Sana Özel" akışında önce bu konular gelir (en fazla 10)'>
                                <InterestChips categories={allCategories} selected={interestIds} onToggle={(id) => setInterestIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))} />
                                <div className="flex items-center justify-between mt-4">
                                    <span className="text-xs font-semibold text-gray-500">{interestIds.length}/10 seçili</span>
                                    <button type="button" onClick={saveInterests} disabled={interestSaving || JSON.stringify([...interestIds].sort()) === JSON.stringify([...(savedInterestIds || [])].sort())}
                                        className={BTN_PRIMARY}>
                                        {interestSaving ? 'Kaydediliyor…' : 'Kaydet'}
                                    </button>
                                </div>
                            </SettingsCard>

                            {/* ───── Güvenlik ───── */}
                            <SettingsCard id="guvenlik" hidden={activeSection !== 'guvenlik'} icon={<FaLock />} tint="bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300" title="Şifre" subtitle="Mevcut şifreni doğrulayarak yeni bir şifre belirle">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <Field label="Mevcut şifre" htmlFor="mevcut-sifre">
                                        <input id="mevcut-sifre" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Mevcut şifren" className={INPUT} />
                                    </Field>
                                    <Field label="Yeni şifre" htmlFor="yeni-sifre">
                                        <input id="yeni-sifre" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="En az 8 karakter" className={INPUT} />
                                    </Field>
                                    <Field label="Yeni şifre (tekrar)" htmlFor="yeni-sifre-tekrar">
                                        <input id="yeni-sifre-tekrar" type="password" autoComplete="new-password" value={newPasswordConfirm} onChange={(e) => setNewPasswordConfirm(e.target.value)} placeholder="Yeni şifreni tekrar gir" className={INPUT} />
                                    </Field>
                                </div>
                                {newPassword && newPasswordConfirm && newPassword !== newPasswordConfirm && (
                                    <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">Şifreler eşleşmiyor.</p>
                                )}
                                <div className="mt-4 flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleChangePassword}
                                        disabled={isChangingPassword || !currentPassword || !newPassword || newPassword !== newPasswordConfirm}
                                        className={BTN_PRIMARY}
                                    >
                                        {isChangingPassword ? 'Kaydediliyor…' : 'Şifreyi güncelle'}
                                    </button>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Güçlü bir şifre kullan: en az 8 karakter, harf ve rakam karışımı.</p>
                                </div>
                            </SettingsCard>

                            {/* ───── Tehlikeli bölge ───── */}
                            <SettingsCard id="hesabi-sil" hidden={activeSection !== 'hesabi-sil'} icon={<FaTrash />} tint="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300" title="Hesabı Sil" subtitle="Hesabın 14 gün sonra kalıcı olarak silinir; bu süre içinde giriş yaparsan iptal olur" danger>
                                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                                    <Field label="Şifren" htmlFor="silme-sifre">
                                        <input id="silme-sifre" type="password" autoComplete="current-password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Onaylamak için şifreni gir" className={INPUT} />
                                    </Field>
                                    <button
                                        type="button"
                                        onClick={() => setShowDeleteAccountModal(true)}
                                        disabled={!deletePassword.trim()}
                                        className="h-11 px-5 rounded-xl bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-sm font-bold shadow-[0_10px_25px_-10px_rgba(239,68,68,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Hesabı silmeyi başlat
                                    </button>
                                </div>
                            </SettingsCard>
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
