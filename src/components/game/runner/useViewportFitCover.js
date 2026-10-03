import { useEffect } from 'react';

/*
 * Çentikli telefonlar için `viewport-fit=cover`.
 *
 * index.html'de yok; site geneline eklemek tüm sayfaların kenarlarını çentiğin
 * altına iter. Yalnızca oyun ekranı açıkken <meta name="viewport"> içeriğine
 * eklenir, son kullanıcı ayrılınca orijinal içerik aynen geri yüklenir.
 *
 * Sayaçlı: StrictMode'un söküp yeniden bağlaması (ya da aynı anda iki
 * kullanıcı) orijinali "değiştirilmiş" içerikle ezmesin. Orijinal yalnızca
 * ilk kullanıcıda okunur, son kullanıcı bırakınca yazılır.
 */

const FIT_RE = /viewport-fit\s*=\s*[^,\s]*/i;

let holders = 0;
let saved = null; // { meta, content, created }

export function withViewportFitCover(content) {
    const base = typeof content === 'string' ? content.trim() : '';
    if (!base) return 'viewport-fit=cover';
    if (FIT_RE.test(base)) return base.replace(FIT_RE, 'viewport-fit=cover');
    return `${base.replace(/,\s*$/, '')}, viewport-fit=cover`;
}

function acquire() {
    if (typeof document === 'undefined') return;
    holders += 1;
    if (holders > 1) return;
    try {
        let meta = document.querySelector('meta[name="viewport"]');
        let created = false;
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'viewport');
            document.head.appendChild(meta);
            created = true;
        }
        const content = meta.getAttribute('content');
        saved = { meta, content, created };
        meta.setAttribute('content', withViewportFitCover(content));
    } catch {
        saved = null;
    }
}

function release() {
    if (holders === 0) return;
    holders -= 1;
    if (holders > 0 || !saved) return;
    const { meta, content, created } = saved;
    saved = null;
    try {
        if (created) meta.remove();
        else if (content == null) meta.removeAttribute('content');
        else meta.setAttribute('content', content);
    } catch {
        // meta başka bir kod tarafından kaldırıldıysa yapacak bir şey yok
    }
}

export default function useViewportFitCover() {
    useEffect(() => {
        acquire();
        return release;
    }, []);
}
