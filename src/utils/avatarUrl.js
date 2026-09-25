/**
 * Avatar URL'lerini normalize eder - domain tekrarını ve hatalı formatları düzeltir
 * @param {string|null|undefined} rawUrl - Ham avatar URL'i
 * @returns {string|null} - Normalize edilmiş URL veya null
 */
export const normalizeAvatarUrl = (rawUrl) => {
    if (!rawUrl) return rawUrl;

    let url = String(rawUrl).trim();
    if (!url || url === 'null' || url === 'undefined') return null;

    // Tekrar eden protokolü (`https://https://...`) baştan tek başa indir.
    // Aşağıdaki temizlik yalnızca protokolsüz dalda çalışıyordu; protokolle
    // başlayan girdi ilk koşuldan erken dönüyor ve bozuk adres olduğu gibi
    // tarayıcıya gidiyordu (kırık avatar).
    url = url.replace(/^(?:https?:\/\/)+(?=https?:\/\/)/i, '');

    if (/^https?:\/\//i.test(url)) {
        url = url.replace(
            /^https?:\/\/herkeslersoruyor\.com\.tr\/herkeslersoruyor\.panalix\.com\.tr\//i,
            'https://herkeslersoruyor.panalix.com.tr/'
        );
        if (/^https?:\/\/herkeslersoruyor\.panalix\.com\.tr\//i.test(url)) {
            return url;
        }
        return url;
    }

    url = url.replace(/^(https?:\/\/)+/i, '');
    
    url = url.replace(
        /^herkeslersoruyor\.com\.tr\/herkeslersoruyor\.panalix\.com\.tr\//i,
        'herkeslersoruyor.panalix.com.tr/'
    );

    if (/^herkeslersoruyor\.panalix\.com\.tr\//i.test(url)) {
        return `https://${url}`;
    }

    if (/^storage\//i.test(url)) {
        const API_BASE = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';
        const BASE_URL = API_BASE.replace(/\/api$/, '');
        return `${BASE_URL}/${url}`;
    }

    return `https://${url}`;
};
