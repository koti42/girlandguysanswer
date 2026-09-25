import React from 'react';
import { createPortal } from 'react-dom';
import { FaCheck, FaEdit, FaTimes } from 'react-icons/fa';

/**
 * Yayınlanmış bir sorunun başlığını ve açıklamasını düzenleme kutusu.
 *
 * SingleQuestionView'in gövdesinden çıkarıldı: orada 3.100 satırlık bileşenin
 * içine gömülüydü ve kapsayıcının state'ine doğrudan uzanıyordu. Artık kendi
 * durumu yok - ne göstereceğini ve kaydedince ne yapacağını tamamen props
 * belirler, yani tek başına okunup taşınabilir.
 */
const EditQuestionModal = ({
    isOpen,
    saving,
    title,
    description,
    editsRemaining,
    onTitleChange,
    onDescriptionChange,
    onClose,
    onSave,
}) => {
    if (!isOpen) return null;

    return createPortal(
                <div
                    className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={() => !saving && onClose()}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                    {/* Modal card */}
                    <div
                        className="relative w-full sm:max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Gradient header */}
                        <div className="relative bg-gradient-to-r from-coral to-orange-400 px-6 pt-5 pb-6 flex-shrink-0">
                            <button
                                onClick={() => !saving && onClose()}
                                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center text-white"
                                disabled={saving}
                            >
                                <FaTimes className="text-sm" />
                            </button>
                            <div className="flex items-center gap-3 pr-10">
                                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <FaEdit className="text-white text-lg" />
                                </div>
                                <div>
                                    <h2 className="text-white font-bold text-lg leading-tight">Soruyu Düzenle</h2>
                                    <p className="text-white/80 text-xs mt-0.5 leading-snug">
                                        Yayın sonrası 30 dk ve en fazla 2 düzenleme hakkı
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable body — negatif margin yok; turuncu başlık ile form net ayrılır */}
                        <div className="relative z-10 overflow-y-auto flex-1 px-6 pt-6 pb-6 flex flex-col gap-4 bg-white dark:bg-gray-900">
                            {typeof editsRemaining === 'number' && editsRemaining > 0 && (
                                <div className="flex justify-center -mb-1">
                                    <span className="inline-flex items-center rounded-full bg-gradient-to-r from-coral/15 to-orange-400/15 dark:from-coral/25 dark:to-orange-500/20 text-coral dark:text-orange-300 text-xs font-semibold px-4 py-1.5 border border-coral/20 dark:border-orange-500/30">
                                        Kalan düzenleme hakkı: {editsRemaining} / 2
                                    </span>
                                </div>
                            )}

                            {/* Floating inner card */}
                            <div className="bg-gray-50 dark:bg-gray-800/80 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-4 sm:p-5 space-y-5">

                                {/* Title field */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Başlık</label>
                                        <span className={`text-xs font-medium ${title.trim().length < 10 ? 'text-orange-400' : 'text-green-500'}`}>
                                            {title.length}/500
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => onTitleChange(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm"
                                        maxLength={500}
                                        disabled={saving}
                                        placeholder="Sorunuzu kısaca yazın…"
                                    />
                                    {title.trim().length > 0 && title.trim().length < 10 && (
                                        <p className="text-xs text-orange-400 mt-1.5">{10 - title.trim().length} karakter daha gerekli</p>
                                    )}
                                </div>

                                {/* Divider */}
                                <div className="border-t border-gray-100 dark:border-gray-700" />

                                {/* Description field */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Detay <span className="normal-case font-normal text-gray-400">(isteğe bağlı)</span></label>
                                    </div>
                                    <textarea
                                        value={description}
                                        onChange={(e) => onDescriptionChange(e.target.value)}
                                        rows={8}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/60 text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-coral/40 focus:border-coral transition text-sm resize-none leading-relaxed"
                                        disabled={saving}
                                        placeholder="Sorunuzu daha ayrıntılı açıklayın…"
                                    />
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">Not: detay alanındaki görseller ve biçimlendirme korunur.</p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => !saving && onClose()}
                                    disabled={saving}
                                    className="flex-1 py-3 px-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                >
                                    İptal
                                </button>
                                <button
                                    type="button"
                                    onClick={onSave}
                                    disabled={saving || title.trim().length < 10}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-coral to-orange-400 text-white font-bold text-sm hover:shadow-lg hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none transition-all"
                                >
                                    {saving ? (
                                        <>
                                            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                            Kaydediliyor…
                                        </>
                                    ) : (
                                        <>
                                            <FaCheck className="text-xs" />
                                            Kaydet
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
        document.body
    );
};

export default EditQuestionModal;
