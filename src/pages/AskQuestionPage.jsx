import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTimes, FaImage, FaPlus, FaCheckCircle, FaLightbulb, FaExclamationTriangle } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import RichTextEditor from '../components/RichTextEditor';
import { categories } from '../data/mockData';

const AskQuestionPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        title: '',
        category: '',
        description: '',
        tags: [],
        image: null
    });
    const [tagInput, setTagInput] = useState('');
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleAddTag = () => {
        if (tagInput.trim() && formData.tags.length < 5) {
            const newTag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
            if (!formData.tags.includes(newTag)) {
                setFormData(prev => ({
                    ...prev,
                    tags: [...prev.tags, newTag]
                }));
            }
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFormData(prev => ({ ...prev, image: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.title.trim()) {
            newErrors.title = 'Soru başlığı zorunludur';
        } else if (formData.title.length < 10) {
            newErrors.title = 'Soru başlığı en az 10 karakter olmalıdır';
        }
        if (!formData.category) {
            newErrors.category = 'Kategori seçimi zorunludur';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);

        setTimeout(() => {
            setIsSubmitting(false);
            setIsSuccess(true);

            setTimeout(() => {
                navigate('/');
            }, 2000);
        }, 1500);
    };

    // Sidebar Widgets
    const TipsWidget = () => (
        <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl shadow-soft p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <FaLightbulb className="text-gold" />
                İpuçları
            </h3>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
                <li className="flex gap-2">
                    <span className="text-coral">•</span>
                    <span>Başlığınızı açık ve net yazın</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-coral">•</span>
                    <span>Doğru kategori seçimi önemli</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-coral">•</span>
                    <span>Etiketler sorunuzun bulunmasını kolaylaştırır</span>
                </li>
                <li className="flex gap-2">
                    <span className="text-coral">•</span>
                    <span>Görsel eklemek daha fazla ilgi çeker</span>
                </li>
            </ul>
        </div>
    );

    const RulesWidget = () => (
        <div className="bg-orange-50 dark:bg-gray-800 rounded-2xl shadow-soft p-6 border border-orange-100 dark:border-gray-700">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800 dark:text-white">
                <FaExclamationTriangle className="text-orange-500" />
                Topluluk Kuralları
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li>✓ Saygılı ve nazik olun</li>
                <li>✓ Spam yapmayın</li>
                <li>✓ Kişisel bilgi paylaşmayın</li>
                <li>✓ Açık ve dürüst olun</li>
            </ul>
        </div>
    );

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl shadow-soft p-12 text-center max-w-md">
                    <FaCheckCircle className="text-green-500 text-6xl mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white dark:text-gray-100 mb-2">Sorunuz Gönderildi!</h2>
                    <p className="text-gray-600 dark:text-gray-400">Ana sayfaya yönlendiriliyorsunuz...</p>
                </div>
            </div>
        );
    }

    const SidebarContent = (
        <>
            <TipsWidget />
            <RulesWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <div className="flex flex-col gap-6">
                {/* Header */}
                <div className="bg-gradient-to-r from-coral to-orange-400 rounded-2xl p-8 text-white">
                    <h1 className="text-3xl font-bold mb-2">Soru Sor</h1>
                    <p className="text-white/90">Topluluğa sormak istediğin soruyu detaylı bir şekilde anlat</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Main Form Card */}
                    <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-2xl shadow-soft p-6 md:p-8">
                        {/* Title */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Soru Başlığı <span className="text-coral">*</span>
                            </label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                placeholder="Örn: Yaz düğünü için hangi renk abiye önerirsiniz?"
                                className={`w-full px-4 py-3 rounded-xl border ${errors.title ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                    } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                maxLength={200}
                            />
                            <div className="flex justify-between mt-2">
                                {errors.title && <span className="text-red-500 text-sm">{errors.title}</span>}
                                <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">{formData.title.length}/200</span>
                            </div>
                        </div>

                        {/* Category */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Kategori <span className="text-coral">*</span>
                            </label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleInputChange}
                                className={`w-full px-4 py-3 rounded-xl border ${errors.category ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                    } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                            >
                                <option value="">Kategori seçin...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.title}>{cat.title}</option>
                                ))}
                            </select>
                            {errors.category && <span className="text-red-500 text-sm mt-2 block">{errors.category}</span>}
                        </div>

                        {/* Tags */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Etiketler <span className="text-gray-400 font-normal">(En fazla 5)</span>
                            </label>
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                    placeholder="Etiket ekle..."
                                    className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all"
                                    disabled={formData.tags.length >= 5}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTag}
                                    disabled={formData.tags.length >= 5 || !tagInput.trim()}
                                    className="px-4 py-2 bg-coral text-white rounded-xl hover:bg-coral/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <FaPlus /> Ekle
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map((tag, idx) => (
                                    <span key={idx} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-full text-sm flex items-center gap-2">
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(tag)}
                                            className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <FaTimes />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Açıklama <span className="text-gray-400 font-normal">(Opsiyonel)</span>
                            </label>
                            <RichTextEditor
                                value={formData.description}
                                onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                                placeholder="Sorunuzla ilgili daha fazla detay paylaşabilirsiniz..."
                            />
                            <span className="text-gray-400 dark:text-gray-500 text-sm block mt-2">Metin editörü ile zengin içerik oluşturabilirsiniz</span>
                        </div>

                        {/* Image Upload */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Görsel Ekle <span className="text-gray-400 font-normal">(Opsiyonel)</span>
                            </label>
                            {formData.image ? (
                                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                                    <img src={formData.image} alt="Preview" className="w-full h-64 object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, image: null }))}
                                        className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                                    >
                                        <FaTimes />
                                    </button>
                                </div>
                            ) : (
                                <label className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:border-coral transition-colors">
                                    <FaImage className="text-4xl text-gray-400 mb-3" />
                                    <span className="text-gray-600 dark:text-gray-400 mb-1">Görsel yüklemek için tıklayın</span>
                                    <span className="text-gray-400 text-sm">PNG, JPG (max. 5MB)</span>
                                    <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                                </label>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="flex-1 py-3 px-6 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:bg-gray-700 transition-colors"
                        >
                            İptal
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-1 py-3 px-6 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Gönderiliyor...' : 'Soru Sor'}
                        </button>
                    </div>
                </form>
            </div>
        </MainLayout>
    );
};

export default AskQuestionPage;
