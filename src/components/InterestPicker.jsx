import React, { useEffect, useState } from 'react';
import { FaCheck, FaMagic, FaTimes } from 'react-icons/fa';
import { categoriesAPI, usersAPI } from '../services/api';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { notificationToast } from '../utils/notificationToast';

export const INTERESTS_PROMPT_KEY = 'interests_prompt_dismissed';

/**
 * İlgi alanı chip'leri: kategori listesinden en fazla 10 seçim. Hem ayarlar
 * sayfasında (inline) hem de ilk giriş penceresinde kullanılır.
 */
export const InterestChips = ({ categories, selected, onToggle, max = 10 }) => (
    <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
            const Icon = getCategoryIcon(cat.name);
            const color = getCategoryColor(cat.color);
            const on = selected.includes(cat.id);
            const disabled = !on && selected.length >= max;
            return (
                <button
                    key={cat.id}
                    type="button"
                    onClick={() => !disabled && onToggle(cat.id)}
                    aria-pressed={on}
                    disabled={disabled}
                    style={on ? { backgroundColor: color, borderColor: color } : { backgroundColor: `${color}14`, borderColor: `${color}26`, color }}
                    className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors motion-reduce:transition-none disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${on ? 'text-white' : ''}`}
                >
                    {on ? <FaCheck className="text-xs" /> : <Icon className="text-sm" />}
                    <span className="truncate max-w-[200px]">{cat.name}</span>
                </button>
            );
        })}
    </div>
);

/** İlk giriş penceresi: 3–5 ilgi alanı seç; isteğe bağlı, kapatılabilir. */
const EMPTY = [];

const InterestPicker = ({ isOpen, onClose, onSaved, initialSelected = EMPTY }) => {
    const [categories, setCategories] = useState([]);
    const [selected, setSelected] = useState(initialSelected);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);

    // Pencere açılınca bir kez: seçim sıfırlanır ve kategoriler çekilir.
    // initialSelected varsayılanı sabit (EMPTY); her çizimde yeni dizi gelseydi
    // effect sürekli tetiklenir, liste boşalırdı.
    useEffect(() => {
        if (!isOpen) return;
        setSelected(initialSelected);
        setLoading(true);
        categoriesAPI.getAll()
            .then((r) => {
                const d = r.data?.data;
                const list = Array.isArray(d?.categories) ? d.categories : Array.isArray(d) ? d : [];
                setCategories(list);
            })
            .catch(() => setCategories([]))
            .finally(() => setLoading(false));
    }, [isOpen, initialSelected]);

    if (!isOpen) return null;

    const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const save = async () => {
        setSaving(true);
        try {
            const r = await usersAPI.updateInterests(selected);
            try { localStorage.setItem(INTERESTS_PROMPT_KEY, '1'); } catch { /* yok say */ }
            notificationToast.success('İlgi alanların kaydedildi. "Sana Özel" akışın hazır!');
            onSaved?.(r.data?.data?.interests || []);
            onClose();
        } catch (e) {
            notificationToast.error(e.response?.data?.message || 'Kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const dismiss = () => {
        try { localStorage.setItem(INTERESTS_PROMPT_KEY, '1'); } catch { /* yok say */ }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="interest-title">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={dismiss} aria-hidden="true" />
            <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-line dark:border-gray-700">
                <button type="button" onClick={dismiss} className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Kapat"><FaTimes /></button>
                <div className="p-6 pt-8">
                    <div className="w-14 h-14 rounded-2xl bg-blue-soft text-brand-blue flex items-center justify-center mb-4"><FaMagic className="text-2xl" /></div>
                    <h2 id="interest-title" className="text-xl font-bold text-ink dark:text-white">Nelerle ilgileniyorsun?</h2>
                    <p className="text-sm text-ink-muted dark:text-gray-400 mt-1 mb-5">3–5 konu seç; "Sana Özel" akışında önce bunlar gelsin. İstediğin zaman Ayarlar'dan değiştirebilirsin.</p>
                    <div className="max-h-[42vh] overflow-y-auto pr-1">
                        {loading ? (
                            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-blue border-t-transparent" /></div>
                        ) : categories.length === 0 ? (
                            <p className="text-sm text-ink-muted py-6 text-center">Kategoriler yüklenemedi. Daha sonra Ayarlar › İlgi alanları bölümünden seçebilirsin.</p>
                        ) : (
                            <InterestChips categories={categories} selected={selected} onToggle={toggle} />
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-6">
                        <button type="button" onClick={dismiss} className="text-sm font-semibold text-ink-muted hover:text-ink dark:hover:text-white">Şimdi değil</button>
                        <button type="button" onClick={save} disabled={saving || selected.length === 0} className="h-11 px-6 rounded-2xl bg-brand-pink text-white font-semibold disabled:opacity-50 hover:bg-[#D63C8A] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2">
                            {saving ? 'Kaydediliyor…' : `Kaydet (${selected.length})`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InterestPicker;
