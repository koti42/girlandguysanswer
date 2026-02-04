import React, { useState, useEffect } from 'react';
import { rolesAPI } from '../services/adminApi';
import {
    FaUserShield,
    FaPlus,
    FaEdit,
    FaTrash,
    FaTimes,
    FaSave,
    FaUsers,
    FaLock,
    FaExclamationTriangle,
} from 'react-icons/fa';

const RolesPage = () => {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editRole, setEditRole] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        slug: '',
        description: '',
    });
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const fetchRoles = async () => {
        try {
            setLoading(true);
            const response = await rolesAPI.getAll();
            setRoles(response.data.data?.roles || response.data.data || []);
        } catch (err) {
            console.error('Error fetching roles:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRoles();
    }, []);

    const openModal = (role = null) => {
        setEditRole(role);
        setFormData({
            name: role?.name || '',
            slug: role?.slug || '',
            description: role?.description || '',
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.name.trim() || !formData.slug.trim()) return;
        setSaving(true);
        try {
            if (editRole) {
                await rolesAPI.update(editRole.id, formData);
            } else {
                await rolesAPI.create(formData);
            }
            setShowModal(false);
            fetchRoles();
        } catch (err) {
            console.error('Error saving role:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (role) => {
        try {
            await rolesAPI.delete(role.id);
            setDeleteConfirm(null);
            fetchRoles();
        } catch (err) {
            console.error('Error deleting role:', err);
        }
    };

    const generateSlug = (name) => {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Roller</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Kullanıcı rollerini yönetin</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-coral to-orange-500 text-white rounded-xl hover:shadow-lg hover:shadow-coral/30 transition-all font-semibold"
                >
                    <FaPlus />
                    Yeni Rol
                </button>
            </div>

            {/* Roles Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-10 h-10 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                </div>
            ) : roles.length === 0 ? (
                <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-12 text-center">
                    <FaUserShield className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 text-lg">Henüz rol oluşturulmamış</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {roles.map((role) => (
                        <div
                            key={role.id}
                            className="group bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-6 hover:shadow-xl transition-all duration-300"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${role.is_system
                                        ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30'
                                        : 'bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/30'
                                    }`}>
                                    {role.is_system ? <FaLock className="text-white text-lg" /> : <FaUserShield className="text-white text-lg" />}
                                </div>
                                {!role.is_system && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openModal(role)}
                                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <FaEdit className="text-gray-500" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(role)}
                                            className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <FaTrash className="text-red-500" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{role.name}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 font-mono mb-3">{role.slug}</p>

                            {role.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                                    {role.description}
                                </p>
                            )}

                            <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                    <FaUsers />
                                    <span>{role.users_count || 0} kullanıcı</span>
                                </div>
                                {role.is_system && (
                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                        Sistem
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-md w-full shadow-2xl">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {editRole ? 'Rol Düzenle' : 'Yeni Rol'}
                            </h2>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <FaTimes className="text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Rol Adı</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => {
                                        setFormData({
                                            ...formData,
                                            name: e.target.value,
                                            slug: !editRole ? generateSlug(e.target.value) : formData.slug,
                                        });
                                    }}
                                    placeholder="örn: İçerik Editörü"
                                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Slug</label>
                                <input
                                    type="text"
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                    placeholder="örn: content_editor"
                                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30 font-mono"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Açıklama</label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Bu rolün yetkilerini açıklayın..."
                                    rows={3}
                                    className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30 resize-none"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving || !formData.name.trim() || !formData.slug.trim()}
                                className="flex-1 py-3 px-4 rounded-xl bg-coral text-white font-semibold hover:bg-coral/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <FaSave />
                                {saving ? 'Kaydediliyor...' : 'Kaydet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-sm w-full shadow-2xl p-6 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <FaExclamationTriangle className="text-red-500 text-2xl" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Rolü Sil</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">
                            <strong>{deleteConfirm.name}</strong> rolünü silmek istediğinize emin misiniz?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                İptal
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="flex-1 py-3 px-4 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RolesPage;
