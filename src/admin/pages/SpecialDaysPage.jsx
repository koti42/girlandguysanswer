import React, { useState, useEffect } from 'react';
import { specialDaysAPI } from '../services/adminApi';
import { FaCalendarAlt, FaToggleOn, FaToggleOff, FaSpinner, FaPalette } from 'react-icons/fa';

const SpecialDaysPage = () => {
    const [days, setDays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchDays = async () => {
        try {
            setLoading(true);
            const res = await specialDaysAPI.getAll();
            setDays(res.data?.data || []);
        } catch {
            showToast('Özel günler yüklenemedi.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDays();
    }, []);

    const handleToggle = async (day) => {
        setTogglingId(day.id);
        try {
            const res = await specialDaysAPI.toggle(day.id);
            setDays((prev) =>
                prev.map((d) => (d.id === day.id ? res.data.data : d))
            );
            showToast(res.data.message || 'Güncellendi.');
        } catch {
            showToast('Güncelleme başarısız.', 'error');
        } finally {
            setTogglingId(null);
        }
    };

    const startEdit = (day) => {
        setEditingId(day.id);
        setEditForm({
            short_label: day.short_label,
            label: day.label,
            emoji: day.emoji,
            badge_emoji: day.badge_emoji,
            color: day.color,
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const saveEdit = async (day) => {
        try {
            const res = await specialDaysAPI.update(day.id, editForm);
            setDays((prev) =>
                prev.map((d) => (d.id === day.id ? res.data.data : d))
            );
            showToast(res.data.message || 'Güncellendi.');
            cancelEdit();
        } catch {
            showToast('Güncelleme başarısız.', 'error');
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Toast */}
            {toast && (
                <div
                    className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-white font-semibold transition-all
                        ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
                >
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-coral/10 flex items-center justify-center">
                        <FaCalendarAlt className="text-coral text-xl" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Özel Gün Rozetleri</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Açık olan rozetler logo yanında tüm kullanıcılara gösterilir.
                        </p>
                    </div>
                </div>
            </div>

            {/* Liste */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <FaSpinner className="text-coral text-3xl animate-spin" />
                </div>
            ) : (
                <div className="grid gap-4">
                    {days.map((day) => (
                        <div
                            key={day.id}
                            className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-2 transition-all
                                ${day.is_active
                                    ? 'border-green-400 dark:border-green-500'
                                    : 'border-gray-200 dark:border-gray-700'
                                }`}
                        >
                            {editingId === day.id ? (
                                /* Düzenleme Modu */
                                <div className="p-5 space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kısa Etiket</label>
                                            <input
                                                type="text"
                                                value={editForm.short_label}
                                                onChange={(e) => setEditForm({ ...editForm, short_label: e.target.value })}
                                                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-coral"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tam Etiket</label>
                                            <input
                                                type="text"
                                                value={editForm.label}
                                                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                                                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-coral"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rozet Emojisi</label>
                                            <input
                                                type="text"
                                                value={editForm.badge_emoji}
                                                onChange={(e) => setEditForm({ ...editForm, badge_emoji: e.target.value })}
                                                className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-coral"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Rozet Rengi</label>
                                            <div className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="color"
                                                    value={editForm.color}
                                                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                                                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                                                />
                                                <input
                                                    type="text"
                                                    value={editForm.color}
                                                    onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-coral"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Önizleme */}
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">Önizleme:</span>
                                        <span
                                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold shadow"
                                            style={{ border: `2px solid ${editForm.color}`, color: editForm.color, background: 'white' }}
                                        >
                                            <span>{editForm.badge_emoji}</span>
                                            <span>{editForm.short_label}</span>
                                            <span>🇹🇷</span>
                                        </span>
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button
                                            onClick={() => saveEdit(day)}
                                            className="px-4 py-2 bg-coral text-white rounded-lg text-sm font-semibold hover:bg-coral/90 transition"
                                        >
                                            Kaydet
                                        </button>
                                        <button
                                            onClick={cancelEdit}
                                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                                        >
                                            İptal
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Normal Görünüm */
                                <div className="p-5 flex items-center justify-between gap-4 flex-wrap">
                                    <div className="flex items-center gap-4 min-w-0">
                                        {/* Rozet Önizleme */}
                                        <span
                                            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold shadow shrink-0"
                                            style={{
                                                border: `2px solid ${day.color}`,
                                                color: day.color,
                                                background: 'white',
                                            }}
                                        >
                                            <span>{day.badge_emoji}</span>
                                            <span className="hidden sm:inline">{day.short_label}</span>
                                            <span>🇹🇷</span>
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-900 dark:text-white text-sm sm:text-base truncate">
                                                {day.short_label}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {day.label}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        {/* Durum etiketi */}
                                        <span
                                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                                day.is_active
                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                                            }`}
                                        >
                                            {day.is_active ? 'Aktif' : 'Pasif'}
                                        </span>

                                        {/* Düzenle */}
                                        <button
                                            onClick={() => startEdit(day)}
                                            className="p-2 rounded-lg text-gray-400 hover:text-coral hover:bg-coral/10 transition"
                                            title="Düzenle"
                                        >
                                            <FaPalette className="text-lg" />
                                        </button>

                                        {/* Toggle */}
                                        <button
                                            onClick={() => handleToggle(day)}
                                            disabled={togglingId === day.id}
                                            className="flex items-center gap-2 transition"
                                            title={day.is_active ? 'Kapat' : 'Aç'}
                                        >
                                            {togglingId === day.id ? (
                                                <FaSpinner className="text-2xl text-coral animate-spin" />
                                            ) : day.is_active ? (
                                                <FaToggleOn className="text-3xl text-green-500 hover:text-green-600 transition" />
                                            ) : (
                                                <FaToggleOff className="text-3xl text-gray-400 hover:text-gray-500 transition" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <p className="mt-6 text-xs text-gray-400 dark:text-gray-600 text-center">
                Değişiklikler anında tüm kullanıcılara yansır. Birden fazla rozet aynı anda aktif olabilir.
            </p>
        </div>
    );
};

export default SpecialDaysPage;
