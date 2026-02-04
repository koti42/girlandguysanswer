import React, { useState, useEffect, useCallback } from 'react';
import { answersAPI } from '../services/adminApi';
import {
    FaReply,
    FaSearch,
    FaEye,
    FaTrash,
    FaTimes,
    FaSave,
    FaChevronLeft,
    FaChevronRight,
    FaUser,
    FaCalendar,
    FaQuestionCircle,
    FaEdit,
    FaUserSecret,
} from 'react-icons/fa';

const AnswersPage = () => {
    const [answers, setAnswers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1, total: 0 });
    const [filters, setFilters] = useState({
        search: '',
        per_page: 20,
    });
    const [selectedAnswer, setSelectedAnswer] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    const fetchAnswers = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const params = { ...filters, page };
            Object.keys(params).forEach(key => {
                if (params[key] === '') delete params[key];
            });
            const response = await answersAPI.getAll(params);
            setAnswers(response.data.data?.answers || response.data.data || []);
            setPagination(response.data.data?.pagination || { current_page: page, total_pages: 1, total: 0 });
        } catch (err) {
            console.error('Error fetching answers:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchAnswers();
        }, 300);
        return () => clearTimeout(timer);
    }, [fetchAnswers]);

    const handleUpdate = async () => {
        if (!selectedAnswer) return;
        setSaving(true);
        try {
            await answersAPI.update(selectedAnswer.id, editData);
            setSelectedAnswer(null);
            setEditMode(false);
            fetchAnswers(pagination.current_page);
        } catch (err) {
            console.error('Error updating answer:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (answer) => {
        try {
            await answersAPI.delete(answer.id);
            setDeleteConfirm(null);
            fetchAnswers(pagination.current_page);
        } catch (err) {
            console.error('Error deleting answer:', err);
        }
    };

    const openModal = (answer) => {
        setSelectedAnswer(answer);
        setEditData({
            content: answer.content,
            is_anonymous: answer.is_anonymous,
        });
        setEditMode(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Cevaplar</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Toplam {pagination.total?.toLocaleString() || 0} cevap
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
                        placeholder="Cevap ara..."
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
                ) : answers.length === 0 ? (
                    <div className="p-12 text-center">
                        <FaReply className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400 text-lg">Cevap bulunamadı</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cevap</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Soru</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Yazar</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tarih</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {answers.map((answer) => (
                                    <tr key={answer.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-start gap-3 max-w-md">
                                                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                                                    <FaReply className="text-blue-500" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-gray-900 dark:text-white line-clamp-2">
                                                        {answer.content?.replace(/<[^>]*>/g, '')}
                                                    </p>
                                                    {answer.is_anonymous && (
                                                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            <FaUserSecret /> Anonim
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <FaQuestionCircle className="text-orange-500 flex-shrink-0" />
                                                <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 max-w-[200px]">
                                                    {answer.question?.title || 'Bilinmeyen Soru'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                                    {answer.user?.username?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                                    {answer.is_anonymous ? 'Anonim' : (answer.user?.username || 'Bilinmiyor')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(answer.created_at).toLocaleDateString('tr-TR')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => openModal(answer)}
                                                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                                    title="Görüntüle"
                                                >
                                                    <FaEye className="text-gray-500" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(answer)}
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
                                onClick={() => fetchAnswers(pagination.current_page - 1)}
                                disabled={pagination.current_page === 1}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronLeft />
                            </button>
                            <button
                                onClick={() => fetchAnswers(pagination.current_page + 1)}
                                disabled={pagination.current_page === pagination.total_pages}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Answer Modal */}
            {selectedAnswer && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cevap Detayı</h2>
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
                                    onClick={() => { setSelectedAnswer(null); setEditMode(false); }}
                                    className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                    <FaTimes className="text-gray-500" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Question Reference */}
                            {selectedAnswer.question && (
                                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800/50">
                                    <p className="text-xs text-orange-600 dark:text-orange-400 mb-1">Cevaplanan Soru</p>
                                    <p className="font-medium text-orange-800 dark:text-orange-300">{selectedAnswer.question.title}</p>
                                </div>
                            )}

                            {editMode ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cevap</label>
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
                                        dangerouslySetInnerHTML={{ __html: selectedAnswer.content }}
                                    />
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaUser className="text-xs" /> Yazar
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {selectedAnswer.is_anonymous ? 'Anonim' : (selectedAnswer.user?.username || 'Bilinmiyor')}
                                            </p>
                                        </div>
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-2">
                                                <FaCalendar className="text-xs" /> Tarih
                                            </p>
                                            <p className="font-medium text-gray-900 dark:text-white">
                                                {new Date(selectedAnswer.created_at).toLocaleDateString('tr-TR')}
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
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Cevabı Sil</h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">Bu cevabı silmek istediğinize emin misiniz?</p>
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

export default AnswersPage;
