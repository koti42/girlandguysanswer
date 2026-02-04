import React, { useState, useEffect, useCallback } from 'react';
import { opinionsAPI } from '../services/adminApi';
import {
    FaEdit,
    FaSearch,
    FaEye,
    FaTrash,
    FaTimes,
    FaSave,
    FaChevronLeft,
    FaChevronRight,
    FaUser,
    FaCalendar,
    FaComment,
} from 'react-icons/fa';

const OpinionsPage = () => {
    const [opinions, setOpinions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1, total: 0 });
    const [filters, setFilters] = useState({
        search: '',
        per_page: 20,
    });
    const [selectedOpinion, setSelectedOpinion] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const fetchOpinions = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { ...filters, page };
            Object.keys(params).forEach(key => {
                if (params[key] === '') delete params[key];
            });
            const response = await opinionsAPI.getAll(params);
            setOpinions(response.data.data?.opinions || response.data.data || []);
            setPagination(response.data.data?.pagination || { current_page: page, total_pages: 1, total: 0 });
        } catch (err) {
            console.error('Error fetching opinions:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchOpinions();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchOpinions]);

    const handleUpdate = async () => {
        if (!selectedOpinion) return;
        setSaving(true);
        try {
            await opinionsAPI.update(selectedOpinion.id, editData);
            setSelectedOpinion(null);
            setEditMode(false);
            fetchOpinions(pagination.current_page);
        } catch (err) {
            console.error('Error updating opinion:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (opinion) => {
        try {
            await opinionsAPI.delete(opinion.id);
            setDeleteConfirm(null);
            fetchOpinions(pagination.current_page);
        } catch (err) {
            console.error('Error deleting opinion:', err);
        }
    };

    const openModal = (opinion) => {
        setSelectedOpinion(opinion);
        setEditData({
            title: opinion.title,
            content: opinion.content,
            allow_comments: opinion.allow_comments,
        });
        setEditMode(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Görüşler</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Toplam {pagination.total?.toLocaleString() || 0} görüş
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-4">
                <div className="relative max-w-md">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={filters.search}
                        onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                        placeholder="Görüş ara..."
                        className="w-full pl-11 pr-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30"
                    />
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-10 h-10 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                </div>
            ) : opinions.length === 0 ? (
                <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-12 text-center">
                    <FaEdit className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400 text-lg">Görüş bulunamadı</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {opinions.map((opinion) => (
                        <div
                            key={opinion.id}
                            className="group bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden hover:shadow-xl transition-all duration-300"
                        >
                            <div className="p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-white text-xs font-bold">
                                            {opinion.user?.username?.[0]?.toUpperCase() || '?'}
                                        </div>
                                        <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                            {opinion.user?.username || 'Anonim'}
                                        </span>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => openModal(opinion)}
                                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            <FaEye className="text-gray-500 text-sm" />
                                        </button>
                                        <button
                                            onClick={() => setDeleteConfirm(opinion)}
                                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                        >
                                            <FaTrash className="text-red-500 text-sm" />
                                        </button>
                                    </div>
                                </div>
                                <h3 className="font-bold text-gray-900 dark:text-white mb-2 line-clamp-2">{opinion.title}</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4">
                                    {opinion.content?.replace(/<[^>]*>/g, '') || ''}
                                </p>
                                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                    <span>{new Date(opinion.created_at).toLocaleDateString('tr-TR')}</span>
                                    <span className="flex items-center gap-1">
                                        <FaComment />
                                        {opinion.allow_comments ? 'Yorumlar Açık' : 'Yorumlar Kapalı'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {pagination.total_pages > 1 && (
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={() => fetchOpinions(pagination.current_page - 1)}
                        disabled={pagination.current_page === 1}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <FaChevronLeft /> Önceki
                    </button>
                    <span className="text-gray-600 dark:text-gray-400">
                        {pagination.current_page} / {pagination.total_pages}
                    </span>
                    <button
                        onClick={() => fetchOpinions(pagination.current_page + 1)}
                        disabled={pagination.current_page === pagination.total_pages}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Sonraki <FaChevronRight />
                    </button>
                </div>
            )}

            {/* Opinion Modal */}
            {selectedOpinion && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Görüş Detayı</h2>
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
                                    onClick={() => { setSelectedOpinion(null); setEditMode(false); }}
                                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <FaTimes className="text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {editMode ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Başlık</label>
                                        <input
                                            type="text"
                                            value={editData.title}
                                            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                                            className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">İçerik</label>
                                        <textarea
                                            value={editData.content}
                                            onChange={(e) => setEditData({ ...editData, content: e.target.value })}
                                            rows={6}
                                            className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30 resize-none"
                                        />
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editData.allow_comments}
                                            onChange={(e) => setEditData({ ...editData, allow_comments: e.target.checked })}
                                            className="w-5 h-5 rounded text-coral focus:ring-coral"
                                        />
                                        <span className="text-gray-700 dark:text-gray-300">Yorumlara İzin Ver</span>
                                    </label>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{selectedOpinion.title}</h3>
                                        <div
                                            className="prose prose-sm dark:prose-invert max-w-none"
                                            dangerouslySetInnerHTML={{ __html: selectedOpinion.content }}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaUser className="text-xs" /> Yazar
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">{selectedOpinion.user?.username || 'Anonim'}</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaCalendar className="text-xs" /> Tarih
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {new Date(selectedOpinion.created_at).toLocaleDateString('tr-TR')}
                                            </p>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {editMode && (
                            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-3xl">
                                <button
                                    onClick={() => setEditMode(false)}
                                    className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    İptal
                                </button>
                                <button
                                    onClick={handleUpdate}
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

            {/* Delete Confirm */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-sm w-full shadow-2xl p-6 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <FaTrash className="text-red-500 text-2xl" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Görüşü Sil</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">Bu görüşü silmek istediğinize emin misiniz?</p>
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

export default OpinionsPage;
