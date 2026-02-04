import React, { useState, useEffect, useCallback } from 'react';
import { usersAPI, rolesAPI, adminMessagesAPI } from '../services/adminApi';
import {
    FaUsers,
    FaSearch,
    FaFilter,
    FaEye,
    FaEdit,
    FaBan,
    FaSnowflake,
    FaCheckCircle,
    FaTimes,
    FaChevronLeft,
    FaChevronRight,
    FaMars,
    FaVenus,
    FaUserShield,
    FaSave,
    FaComments,
    FaEnvelope,
} from 'react-icons/fa';

const UsersPage = () => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1, total: 0 });
    const [filters, setFilters] = useState({
        search: '',
        role: '',
        banned: '',
        frozen: '',
        per_page: 20,
    });
    const [selectedUser, setSelectedUser] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [conversations, setConversations] = useState([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);

    const fetchUsers = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { ...filters, page };
            // Clean empty params
            Object.keys(params).forEach(key => {
                if (params[key] === '') delete params[key];
            });
            const response = await usersAPI.getAll(params);
            setUsers(response.data.data?.users || []);
            setPagination(response.data.data?.pagination || { current_page: page, total_pages: 1, total: 0 });
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    const fetchRoles = async () => {
        try {
            const response = await rolesAPI.getAll();
            setRoles(response.data.data?.roles || response.data.data || []);
        } catch (err) {
            console.error('Error fetching roles:', err);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchUsers();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchUsers]);

    const fetchUserConversations = async (userId) => {
        if (!userId) return;
        setConversationsLoading(true);
        try {
            const response = await adminMessagesAPI.getUserConversations(userId, { limit: 50 });
            setConversations(response.data.data?.conversations || []);
        } catch (err) {
            console.error('Error fetching user conversations:', err);
        } finally {
            setConversationsLoading(false);
        }
    };

    const fetchConversationMessages = async (conversationId) => {
        if (!conversationId) return;
        setMessagesLoading(true);
        try {
            const response = await adminMessagesAPI.getConversationMessages(conversationId, { limit: 100 });
            setMessages(response.data.data?.messages || []);
        } catch (err) {
            console.error('Error fetching conversation messages:', err);
        } finally {
            setMessagesLoading(false);
        }
    };

    const handleUpdateUser = async () => {
        if (!selectedUser) return;
        setSaving(true);
        try {
            await usersAPI.update(selectedUser.id, editData);
            if (editData.role_slugs) {
                await usersAPI.updateRoles(selectedUser.id, editData.role_slugs);
            }
            setSelectedUser(null);
            setEditMode(false);
            fetchUsers(pagination.current_page);
        } catch (err) {
            console.error('Error updating user:', err);
        } finally {
            setSaving(false);
        }
    };

    const openUserModal = (user) => {
        setSelectedUser(user);
        setEditData({
            username: user.username,
            email: user.email,
            gender: user.gender,
            is_verified: user.is_verified,
            role_slugs: user.roles?.map(r => r.slug) || [],
        });
        setEditMode(false);
        setSelectedConversation(null);
        setMessages([]);
        fetchUserConversations(user.id);
    };

    const getGenderIcon = (gender) => {
        if (gender === 'male') return <FaMars className="text-blue-500" />;
        if (gender === 'female') return <FaVenus className="text-pink-500" />;
        return null;
    };

    const getStatusBadges = (user) => {
        const badges = [];
        if (user.banned_at) {
            badges.push(
                <span key="banned" className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1">
                    <FaBan className="text-[10px]" /> Yasaklı
                </span>
            );
        }
        if (user.frozen_at) {
            badges.push(
                <span key="frozen" className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                    <FaSnowflake className="text-[10px]" /> Dondurulmuş
                </span>
            );
        }
        if (user.is_verified) {
            badges.push(
                <span key="verified" className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                    <FaCheckCircle className="text-[10px]" /> Onaylı
                </span>
            );
        }
        return badges;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Kullanıcılar</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Toplam {pagination.total.toLocaleString()} kullanıcı
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-4">
                <div className="flex flex-wrap gap-4">
                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={filters.search}
                                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                                placeholder="Kullanıcı ara..."
                                className="w-full pl-11 pr-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30"
                            />
                        </div>
                    </div>

                    {/* Role Filter */}
                    <select
                        value={filters.role}
                        onChange={(e) => setFilters({ ...filters, role: e.target.value })}
                        className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                    >
                        <option value="">Tüm Roller</option>
                        {roles.map(role => (
                            <option key={role.id} value={role.slug}>{role.name}</option>
                        ))}
                    </select>

                    {/* Banned Filter */}
                    <select
                        value={filters.banned}
                        onChange={(e) => setFilters({ ...filters, banned: e.target.value })}
                        className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                    >
                        <option value="">Yasaklı Durumu</option>
                        <option value="true">Yasaklı</option>
                        <option value="false">Yasaklı Değil</option>
                    </select>

                    {/* Frozen Filter */}
                    <select
                        value={filters.frozen}
                        onChange={(e) => setFilters({ ...filters, frozen: e.target.value })}
                        className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                    >
                        <option value="">Dondurma Durumu</option>
                        <option value="true">Dondurulmuş</option>
                        <option value="false">Aktif</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="p-12 text-center">
                        <FaUsers className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400 text-lg">Kullanıcı bulunamadı</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kullanıcı</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Roller</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durum</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Kayıt</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-coral to-orange-500 flex items-center justify-center text-white font-bold">
                                                    {user.username?.[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-gray-900 dark:text-white">{user.username}</span>
                                                        {getGenderIcon(user.gender)}
                                                    </div>
                                                    <span className="text-sm text-gray-500 dark:text-gray-400">{user.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles?.map(role => (
                                                    <span key={role.id} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                        {role.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {getStatusBadges(user)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(user.created_at).toLocaleDateString('tr-TR')}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openUserModal(user)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-coral hover:bg-coral/10 rounded-lg transition-colors"
                                            >
                                                <FaEye />
                                                Detay
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {pagination.total_pages > 1 && (
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Sayfa {pagination.current_page} / {pagination.total_pages}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => fetchUsers(pagination.current_page - 1)}
                                disabled={pagination.current_page === 1}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronLeft />
                            </button>
                            <button
                                onClick={() => fetchUsers(pagination.current_page + 1)}
                                disabled={pagination.current_page === pagination.total_pages}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* User Detail Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kullanıcı Detayı</h2>
                            <div className="flex items-center gap-2">
                                {!editMode && (
                                    <button
                                        onClick={() => setEditMode(true)}
                                        className="px-4 py-2 rounded-xl bg-coral/10 text-coral hover:bg-coral/20 transition-colors flex items-center gap-2"
                                    >
                                        <FaEdit /> Düzenle
                                    </button>
                                )}
                                <button
                                    onClick={() => { setSelectedUser(null); setEditMode(false); }}
                                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <FaTimes className="text-gray-500" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6">
                            {/* User Header */}
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-coral to-orange-500 flex items-center justify-center text-white text-2xl font-bold">
                                    {selectedUser.username?.[0]?.toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{selectedUser.username}</h3>
                                    <p className="text-gray-500 dark:text-gray-400">{selectedUser.email}</p>
                                </div>
                            </div>

                            {editMode ? (
                                /* Edit Form */
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Kullanıcı Adı</label>
                                            <input
                                                type="text"
                                                value={editData.username}
                                                onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">E-posta</label>
                                            <input
                                                type="email"
                                                value={editData.email}
                                                onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cinsiyet</label>
                                            <select
                                                value={editData.gender}
                                                onChange={(e) => setEditData({ ...editData, gender: e.target.value })}
                                                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                                            >
                                                <option value="male">Erkek</option>
                                                <option value="female">Kadın</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Onay Durumu</label>
                                            <select
                                                value={editData.is_verified ? 'true' : 'false'}
                                                onChange={(e) => setEditData({ ...editData, is_verified: e.target.value === 'true' })}
                                                className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                                            >
                                                <option value="true">Onaylı</option>
                                                <option value="false">Onaysız</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Roller</label>
                                        <div className="flex flex-wrap gap-2">
                                            {roles.map(role => (
                                                <button
                                                    key={role.id}
                                                    type="button"
                                                    onClick={() => {
                                                        const current = editData.role_slugs || [];
                                                        if (current.includes(role.slug)) {
                                                            setEditData({ ...editData, role_slugs: current.filter(s => s !== role.slug) });
                                                        } else {
                                                            setEditData({ ...editData, role_slugs: [...current, role.slug] });
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${editData.role_slugs?.includes(role.slug)
                                                            ? 'bg-coral text-white'
                                                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                        }`}
                                                >
                                                    {role.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Cinsiyet</p>
                                        <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                            {getGenderIcon(selectedUser.gender)}
                                            {selectedUser.gender === 'male' ? 'Erkek' : 'Kadın'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Kayıt Tarihi</p>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {new Date(selectedUser.created_at).toLocaleDateString('tr-TR')}
                                        </p>
                                    </div>
                                    <div className="col-span-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Roller</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedUser.roles?.map(role => (
                                                <span key={role.id} className="px-3 py-1 rounded-lg text-sm font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                    {role.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="col-span-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Durum</p>
                                        <div className="flex flex-wrap gap-2">
                                            {getStatusBadges(selectedUser).length > 0 ? getStatusBadges(selectedUser) : (
                                                <span className="text-gray-500 dark:text-gray-400">Normal</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Mesaj konuşmaları */}
                                    <div className="col-span-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                <FaComments className="text-xs" />
                                                Mesaj Konuşmaları
                                            </p>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {conversations.length} konuşma
                                            </span>
                                        </div>

                                        {conversationsLoading ? (
                                            <div className="flex items-center justify-center py-6">
                                                <div className="w-6 h-6 rounded-full border-2 border-coral/20 border-t-coral animate-spin" />
                                            </div>
                                        ) : conversations.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                Bu kullanıcıya ait konuşma bulunamadı.
                                            </p>
                                        ) : (
                                            <div className="grid md:grid-cols-2 gap-4">
                                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                                    {conversations.map((conv) => (
                                                        <button
                                                            key={conv.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedConversation(conv);
                                                                fetchConversationMessages(conv.id);
                                                            }}
                                                            className={`w-full text-left px-3 py-2 rounded-xl border text-sm transition-colors flex items-start gap-2 ${
                                                                selectedConversation?.id === conv.id
                                                                    ? 'border-coral bg-coral/5 text-gray-900 dark:text-white'
                                                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300'
                                                            }`}
                                                        >
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                                {conv.other_user?.username?.[0]?.toUpperCase() || '?'}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="font-medium truncate">
                                                                    {conv.other_user?.username || 'Diğer kullanıcı'}
                                                                </p>
                                                                {conv.latest_message && (
                                                                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                                                                        {conv.latest_message.content}
                                                                    </p>
                                                                )}
                                                                {conv.last_message_at && (
                                                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                                                        {new Date(conv.last_message_at).toLocaleString('tr-TR')}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Mesajlar */}
                                                <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-56 overflow-y-auto p-3 space-y-2 bg-white/60 dark:bg-gray-800/60">
                                                    {messagesLoading && (
                                                        <div className="flex items-center justify-center py-4">
                                                            <div className="w-5 h-5 rounded-full border-2 border-coral/20 border-t-coral animate-spin" />
                                                        </div>
                                                    )}
                                                    {!messagesLoading && (!selectedConversation || messages.length === 0) && (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                                            <FaEnvelope className="text-[11px]" />
                                                            Bir konuşma seçerek mesajları görüntüleyin.
                                                        </p>
                                                    )}
                                                    {!messagesLoading && messages.length > 0 && (
                                                        messages.map((msg) => (
                                                            <div
                                                                key={msg.id}
                                                                className="text-xs rounded-lg px-3 py-2 bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100"
                                                            >
                                                                <div className="flex items-center justify-between mb-1">
                                                                    <span className="font-medium">
                                                                        {msg.sender?.username || (msg.sender_id === selectedUser.id ? 'Kullanıcı' : 'Diğer')}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-400">
                                                                        {new Date(msg.created_at).toLocaleString('tr-TR')}
                                                                    </span>
                                                                </div>
                                                                <p className="whitespace-pre-wrap break-words">
                                                                    {msg.content}
                                                                </p>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        {editMode && (
                            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-3xl">
                                <button
                                    onClick={() => setEditMode(false)}
                                    className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleUpdateUser}
                                    disabled={saving}
                                    className="flex-1 py-3 px-4 rounded-xl bg-coral text-white font-semibold hover:bg-coral/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <FaSave />
                                    {saving ? 'Kaydediliyor...' : 'Kaydet'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default UsersPage;
