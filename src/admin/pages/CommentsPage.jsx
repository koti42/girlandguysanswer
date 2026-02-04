import React, { useState, useEffect, useCallback } from 'react';
import { commentsAPI } from '../services/adminApi';
import {
    FaComments,
    FaSearch,
    FaEye,
    FaTrash,
    FaTimes,
    FaSave,
    FaChevronLeft,
    FaChevronRight,
    FaUser,
    FaCalendar,
    FaEdit,
    FaUserSecret,
    FaLink,
} from 'react-icons/fa';

const CommentsPage = () => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1, total: 0 });
    const [filters, setFilters] = useState({
        search: '',
        per_page: 20,
    });
    const [selectedComment, setSelectedComment] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const fetchComments = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { ...filters, page };
            Object.keys(params).forEach(key => {
                if (params[key] === '') delete params[key];
            });
            const response = await commentsAPI.getAll(params);
            setComments(response.data.data?.comments || response.data.data || []);
            setPagination(response.data.data?.pagination || { current_page: page, total_pages: 1, total: 0 });
        } catch (err) {
            console.error('Error fetching comments:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchComments();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchComments]);

    const handleUpdate = async () => {
        if (!selectedComment) return;
        setSaving(true);
        try {
            await commentsAPI.update(selectedComment.id, editData);
            setSelectedComment(null);
            setEditMode(false);
            fetchComments(pagination.current_page);
        } catch (err) {
            console.error('Error updating comment:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (comment) => {
        try {
            await commentsAPI.delete(comment.id);
            setDeleteConfirm(null);
            fetchComments(pagination.current_page);
        } catch (err) {
            console.error('Error deleting comment:', err);
        }
    };

    const openModal = (comment) => {
        setSelectedComment(comment);
        setEditData({
            content: comment.content,
            is_anonymous: comment.is_anonymous,
        });
        setEditMode(false);
    };

    const getCommentableType = (type) => {
        const types = {
            'App\\Models\\Question': 'Soru',
            'App\\Models\\Answer': 'Cevap',
            'App\\Models\\Opinion': 'Görüş',
        };
        return types[type] || 'İçerik';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Yorumlar</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Toplam {pagination.total?.toLocaleString() || 0} yorum
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
                        placeholder="Yorum ara..."
                        className="w-full pl-11 pr-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30"
                    />
                </div>
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                    </div>
                ) : comments.length === 0 ? (
                    <div className="p-12 text-center">
                        <FaComments className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400 text-lg">Yorum bulunamadı</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yorum</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Bağlı İçerik</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yazar</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tarih</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {comments.map((comment) => (
                                    <tr key={comment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-start gap-3 max-w-md">
                                                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                                                    <FaComments className="text-purple-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-gray-900 dark:text-white line-clamp-2">
                                                        {comment.content?.replace(/<[^>]*>/g, '')}
                                                    </p>
                                                    {comment.is_anonymous && (
                                                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            <FaUserSecret /> Anonim
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                                <FaLink className="text-[10px]" />
                                                {getCommentableType(comment.commentable_type)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                                                    {comment.user?.username?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    {comment.is_anonymous ? 'Anonim' : (comment.user?.username || 'Bilinmiyor')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(comment.created_at).toLocaleDateString('tr-TR')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openModal(comment)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                    title="Görüntüle"
                                                >
                                                    <FaEye className="text-gray-500" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(comment)}
                                                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    title="Sil"
                                                >
                                                    <FaTrash className="text-red-500" />
                                                </button>
                                            </div>
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
                                onClick={() => fetchComments(pagination.current_page - 1)}
                                disabled={pagination.current_page === 1}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronLeft />
                            </button>
                            <button
                                onClick={() => fetchComments(pagination.current_page + 1)}
                                disabled={pagination.current_page === pagination.total_pages}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Comment Modal */}
            {selectedComment && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Yorum Detayı</h2>
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
                                    onClick={() => { setSelectedComment(null); setEditMode(false); }}
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
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Yorum</label>
                                        <textarea
                                            value={editData.content}
                                            onChange={(e) => setEditData({ ...editData, content: e.target.value })}
                                            rows={4}
                                            className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral/30 resize-none"
                                        />
                                    </div>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editData.is_anonymous}
                                            onChange={(e) => setEditData({ ...editData, is_anonymous: e.target.checked })}
                                            className="w-5 h-5 rounded text-coral focus:ring-coral"
                                        />
                                        <span className="text-gray-700 dark:text-gray-300">Anonim</span>
                                    </label>
                                </div>
                            ) : (
                                <>
                                    <div
                                        className="prose prose-sm dark:prose-invert max-w-none p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                                        dangerouslySetInnerHTML={{ __html: selectedComment.content }}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaUser className="text-xs" /> Yazar
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {selectedComment.is_anonymous ? 'Anonim' : (selectedComment.user?.username || 'Bilinmiyor')}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaCalendar className="text-xs" /> Tarih
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {new Date(selectedComment.created_at).toLocaleDateString('tr-TR')}
                                            </p>
                                        </div>
                                        <div className="col-span-2 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaLink className="text-xs" /> Bağlı İçerik
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {getCommentableType(selectedComment.commentable_type)}
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
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Yorumu Sil</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">Bu yorumu silmek istediğinize emin misiniz?</p>
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

export default CommentsPage;
