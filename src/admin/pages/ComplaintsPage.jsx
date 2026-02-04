import React, { useState, useEffect, useCallback } from 'react';
import {
    complaintsAPI,
    questionsAPI,
    opinionsAPI,
    answersAPI,
    commentsAPI,
    adminModerationAPI,
} from '../services/adminApi';
import {
    FaExclamationTriangle,
    FaFilter,
    FaEye,
    FaTimes,
    FaCheckCircle,
    FaTimesCircle,
    FaChevronLeft,
    FaChevronRight,
    FaUser,
    FaCalendar,
    FaClock,
    FaQuestionCircle,
    FaEdit,
    FaReply,
    FaComments,
    FaEnvelope,
    FaFlag,
} from 'react-icons/fa';

const ComplaintsPage = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState('pending');
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolving, setResolving] = useState(false);
    const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1, total: 0 });
    const [contentActionLoading, setContentActionLoading] = useState(false);
    const [contentActionError, setContentActionError] = useState('');
    const [autoHideQuestion, setAutoHideQuestion] = useState(false);
    const [autoRemoveContent, setAutoRemoveContent] = useState(false);

    const fetchComplaints = useCallback(async (page = 1) => {
        try {
            setLoading(true);
            const response = await complaintsAPI.getAll({ status: activeFilter, limit: 20, page });
            setComplaints(response.data.data?.complaints || response.data.data || []);
            setPagination(response.data.data?.pagination || { current_page: page, total_pages: 1, total: 0 });
        } catch (err) {
            console.error('Error fetching complaints:', err);
        } finally {
            setLoading(false);
        }
    }, [activeFilter]);

    useEffect(() => {
        fetchComplaints();
    }, [fetchComplaints]);

    const handleDeleteReportedContent = async () => {
        if (!selectedComplaint || !selectedComplaint.reportable) return;

        const { type, reportable } = selectedComplaint;
        const contentId = reportable.id;

        if (!contentId) return;

        // Sadece içerik tabanlı tiplerde (soru, görüş, cevap, yorum) işlem yap
        if (!['question', 'opinion', 'answer', 'comment'].includes(type)) {
            return;
        }

        setContentActionLoading(true);
        setContentActionError('');

        try {
            if (type === 'question') {
                await questionsAPI.delete(contentId);
            } else if (type === 'opinion') {
                await opinionsAPI.delete(contentId);
            } else if (type === 'answer') {
                await answersAPI.delete(contentId);
            } else if (type === 'comment') {
                await commentsAPI.delete(contentId);
            }

            // İçerik üzerinde işlemden sonra listeyi tazele
            fetchComplaints(pagination.current_page);
        } catch (err) {
            console.error('Error deleting reported content:', err);
            setContentActionError(
                err.response?.data?.message || 'İçerik kaldırılırken bir hata oluştu.'
            );
        } finally {
            setContentActionLoading(false);
        }
    };

    const handleResolve = async (status) => {
        if (!selectedComplaint) return;
        setResolving(true);
        setContentActionError('');

        try {
            // 1) Şikayeti çözümlüyoruz (bu çağrı system mesajlarını tetikler)
            await complaintsAPI.resolve(selectedComplaint.id, {
                status,
                resolution_notes: resolutionNotes,
            });

            // 2) Eğer kabul edildiyse ve aksiyon seçildiyse, içeriğe müdahale et
            if (status === 'accepted' && selectedComplaint.reportable) {
                const { type, reportable } = selectedComplaint;
                const contentId = reportable.id;

                if (contentId) {
                    const reasonPayload = {
                        reason: resolutionNotes?.trim() || 'Şikayet sonucu moderasyon işlemi uygulandı.',
                    };

                    // Soru için gizle / kaldır seçenekleri
                    if (type === 'question') {
                        if (autoHideQuestion) {
                            await adminModerationAPI.hideQuestion(contentId, reasonPayload);
                        } else if (autoRemoveContent) {
                            await adminModerationAPI.removeQuestion(contentId, reasonPayload);
                        }
                    } else if (autoRemoveContent && ['opinion', 'answer', 'comment'].includes(type)) {
                        // Diğer içerik tipleri için soft-delete
                        if (type === 'opinion') {
                            await opinionsAPI.delete(contentId);
                        } else if (type === 'answer') {
                            await answersAPI.delete(contentId);
                        } else if (type === 'comment') {
                            await commentsAPI.delete(contentId);
                        }
                    }
                }
            }

            setSelectedComplaint(null);
            setResolutionNotes('');
            setAutoHideQuestion(false);
            setAutoRemoveContent(false);
            fetchComplaints(pagination.current_page);
        } catch (err) {
            console.error('Error resolving complaint or applying content action:', err);
            setContentActionError(
                err.response?.data?.message || 'Şikayet çözümü veya içerik işlemi sırasında bir hata oluştu.'
            );
        } finally {
            setResolving(false);
        }
    };

    const getTypeIcon = (type) => {
        const icons = {
            question: FaQuestionCircle,
            opinion: FaEdit,
            answer: FaReply,
            comment: FaComments,
            user: FaUser,
            message: FaEnvelope,
        };
        return icons[type] || FaFlag;
    };

    const getTypeLabel = (type) => {
        const labels = {
            question: 'Soru',
            opinion: 'Görüş',
            answer: 'Cevap',
            comment: 'Yorum',
            user: 'Kullanıcı',
            message: 'Mesaj',
        };
        return labels[type] || 'Diğer';
    };

    const getStatusBadge = (status) => {
        const badges = {
            pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Beklemede' },
            accepted: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Kabul Edildi' },
            rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Reddedildi' },
        };
        const badge = badges[status] || badges.pending;
        return (
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${badge.bg} ${badge.text}`}>
                {badge.label}
            </span>
        );
    };

    const filterTabs = [
        { key: 'pending', label: 'Beklemede', icon: FaClock },
        { key: 'accepted', label: 'Kabul Edildi', icon: FaCheckCircle },
        { key: 'rejected', label: 'Reddedildi', icon: FaTimesCircle },
        { key: 'all', label: 'Tümü', icon: FaFilter },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Şikayetler</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">
                        Kullanıcı şikayetlerini yönetin
                    </p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 p-2">
                <div className="flex flex-wrap gap-2">
                    {filterTabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveFilter(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeFilter === tab.key
                                    ? 'bg-coral text-white shadow-lg shadow-coral/30'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                        >
                            <tab.icon className="text-sm" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Complaints List */}
            <div className="bg-white dark:bg-gray-800/50 backdrop-blur-xl rounded-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-10 h-10 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                    </div>
                ) : complaints.length === 0 ? (
                    <div className="p-12 text-center">
                        <FaExclamationTriangle className="text-5xl text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400 text-lg">
                            {activeFilter === 'pending' ? 'Bekleyen şikayet bulunmuyor' : 'Şikayet bulunamadı'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {complaints.map((complaint) => {
                            const TypeIcon = getTypeIcon(complaint.type);
                            return (
                                <div
                                    key={complaint.id}
                                    className="p-5 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Type Icon */}
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${complaint.status === 'pending'
                                                ? 'bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg shadow-amber-500/30'
                                                : complaint.status === 'accepted'
                                                    ? 'bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/30'
                                                    : 'bg-gradient-to-br from-red-500 to-rose-500 shadow-lg shadow-red-500/30'
                                            }`}>
                                            <TypeIcon className="text-white text-lg" />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-semibold text-gray-900 dark:text-white">
                                                            {getTypeLabel(complaint.type)} Şikayeti
                                                        </span>
                                                        {getStatusBadge(complaint.status)}
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        Şikayet eden: <span className="font-medium">{complaint.reporter?.username || 'Bilinmiyor'}</span>
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedComplaint(complaint)}
                                                    className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center gap-2 text-sm font-medium"
                                                >
                                                    <FaEye />
                                                    Detay
                                                </button>
                                            </div>

                                            {/* Reason */}
                                            <p className="text-gray-700 dark:text-gray-300 line-clamp-2 mb-3">
                                                {complaint.reason || 'Sebep belirtilmemiş'}
                                            </p>

                                            {/* Meta */}
                                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                                <span className="flex items-center gap-1">
                                                    <FaCalendar />
                                                    {new Date(complaint.created_at).toLocaleDateString('tr-TR')}
                                                </span>
                                                {complaint.reportable && (
                                                    <span className="flex items-center gap-1">
                                                        <FaFlag />
                                                        ID: {complaint.reportable_id?.slice(0, 8)}...
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
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
                                onClick={() => fetchComplaints(pagination.current_page - 1)}
                                disabled={pagination.current_page === 1}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronLeft />
                            </button>
                            <button
                                onClick={() => fetchComplaints(pagination.current_page + 1)}
                                disabled={pagination.current_page === pagination.total_pages}
                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Complaint Detail Modal */}
            {selectedComplaint && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-3xl">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedComplaint.status === 'pending'
                                        ? 'bg-amber-100 dark:bg-amber-900/30'
                                        : selectedComplaint.status === 'accepted'
                                            ? 'bg-green-100 dark:bg-green-900/30'
                                            : 'bg-red-100 dark:bg-red-900/30'
                                    }`}>
                                    {React.createElement(getTypeIcon(selectedComplaint.type), {
                                        className: selectedComplaint.status === 'pending'
                                            ? 'text-amber-500'
                                            : selectedComplaint.status === 'accepted'
                                                ? 'text-green-500'
                                                : 'text-red-500'
                                    })}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">Şikayet Detayı</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{getTypeLabel(selectedComplaint.type)}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setSelectedComplaint(null); setResolutionNotes(''); }}
                                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <FaTimes className="text-gray-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 space-y-6">
                            {/* Status Badge */}
                            <div className="flex items-center gap-3">
                                {getStatusBadge(selectedComplaint.status)}
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(selectedComplaint.created_at).toLocaleString('tr-TR')}
                                </span>
                            </div>

                            {/* Reporter Info */}
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Şikayet Eden</p>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-coral to-orange-500 flex items-center justify-center text-white font-bold">
                                        {selectedComplaint.reporter?.username?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">{selectedComplaint.reporter?.username || 'Bilinmiyor'}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{selectedComplaint.reporter?.email}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Reason */}
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Şikayet Sebebi</p>
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
                                    <p className="text-amber-800 dark:text-amber-300">
                                        {selectedComplaint.reason || 'Sebep belirtilmemiş'}
                                    </p>
                                </div>
                            </div>

                            {/* Reported Content */}
                            {selectedComplaint.reportable && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Şikayet Edilen İçerik</p>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600">
                                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                            {selectedComplaint.reportable.content || selectedComplaint.reportable.title || selectedComplaint.reportable.description || JSON.stringify(selectedComplaint.reportable, null, 2)}
                                        </p>
                                    </div>

                                    {/* İçerik moderasyon aksiyonları */}
                                    {['question', 'opinion', 'answer', 'comment'].includes(selectedComplaint.type) && (
                                        <div className="mt-4 space-y-2">
                                            {contentActionError && (
                                                <p className="text-sm text-red-500 dark:text-red-400">
                                                    {contentActionError}
                                                </p>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handleDeleteReportedContent}
                                                disabled={contentActionLoading}
                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                                            >
                                                <FaTimesCircle />
                                                {contentActionLoading ? 'İçerik Kaldırılıyor...' : 'İçeriği Kaldır (Soft Delete)'}
                                            </button>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Bu işlem ilgili içeriği siteden kaldırır (soft delete). Şikayet durumunu
                                                ayrıca &quot;Kabul Et&quot; / &quot;Reddet&quot; butonları ile güncelleyebilirsiniz.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Resolution Notes & Otomatik işlemler (for pending) */}
                            {selectedComplaint.status === 'pending' && (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Çözüm Notları (Opsiyonel)
                                        </label>
                                        <textarea
                                            value={resolutionNotes}
                                            onChange={(e) => setResolutionNotes(e.target.value)}
                                            rows={3}
                                            placeholder="Karar hakkında notlar... (bu not system mesajlarında da görünebilir)"
                                            className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 border-0 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/30 resize-none"
                                        />
                                    </div>

                                    {/* Otomatik içerik aksiyonları - sadece kabul durumunda çalışır */}
                                    {['question', 'opinion', 'answer', 'comment'].includes(selectedComplaint.type) && (
                                        <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-600 space-y-2">
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Kabul ederken uygulanacak ek işlemler
                                            </p>
                                            {selectedComplaint.type === 'question' && (
                                                <div className="space-y-2">
                                                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={autoHideQuestion}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setAutoHideQuestion(checked);
                                                                if (checked) {
                                                                    setAutoRemoveContent(false);
                                                                }
                                                            }}
                                                            className="w-4 h-4 rounded text-coral focus:ring-coral"
                                                        />
                                                        <span>Bu soruyu gizle (sonradan tekrar görünür yapılabilir)</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                        <input
                                                            type="checkbox"
                                                            checked={autoRemoveContent}
                                                            onChange={(e) => {
                                                                const checked = e.target.checked;
                                                                setAutoRemoveContent(checked);
                                                                if (checked) {
                                                                    setAutoHideQuestion(false);
                                                                }
                                                            }}
                                                            className="w-4 h-4 rounded text-coral focus:ring-coral"
                                                        />
                                                        <span>Bu soruyu kaldır (kural ihlali nedeniyle, remove)</span>
                                                    </label>
                                                </div>
                                            )}

                                            {['opinion', 'answer', 'comment'].includes(selectedComplaint.type) && (
                                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={autoRemoveContent}
                                                        onChange={(e) => setAutoRemoveContent(e.target.checked)}
                                                        className="w-4 h-4 rounded text-coral focus:ring-coral"
                                                    />
                                                    <span>Bu içeriği kaldır (soft delete)</span>
                                                </label>
                                            )}

                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                Seçilen işlemler yalnızca &quot;Kabul Et&quot; butonuna bastığınızda uygulanır.
                                                &quot;Reddet&quot; sadece şikayet kaydını günceller, içeriğe dokunmaz.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Resolution Notes Display (for resolved) */}
                            {selectedComplaint.resolution_notes && selectedComplaint.status !== 'pending' && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Çözüm Notları</p>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                        <p className="text-gray-700 dark:text-gray-300">{selectedComplaint.resolution_notes}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        {selectedComplaint.status === 'pending' && (
                            <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex gap-3 rounded-b-3xl">
                                <button
                                    onClick={() => handleResolve('rejected')}
                                    disabled={resolving}
                                    className="flex-1 py-3 px-4 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <FaTimesCircle />
                                    Reddet
                                </button>
                                <button
                                    onClick={() => handleResolve('accepted')}
                                    disabled={resolving}
                                    className="flex-1 py-3 px-4 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    <FaCheckCircle />
                                    Kabul Et
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ComplaintsPage;
