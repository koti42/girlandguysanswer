import React from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '../components/game/chunkReload';
import { onNativeMessage, postToNative } from './bridge';

const btn =
    'inline-flex min-h-[52px] w-full items-center justify-center rounded-2xl px-5 font-bold game-press focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold';

/*
 * Gömme için çizim hatası sınırı. Sitedeki ErrorBoundary'nin "Ana sayfaya
 * dön" bağlantısı WebView'da siteyi açardı; burada çıkış native'e bildirilir.
 * Hata native'e `error` mesajıyla da iletilir (uygulama kendi ekranını
 * gösterebilir). Hata ekranı native'in `back` mesajını dinler ve çıkış
 * bildirir (oyunun dinleyicileri ağaçla birlikte söküldü). Yeni sürüm yayınlanınca inemeyen parça için sayfa bir kez
 * yenilenir.
 */
class EmbedErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error: error || new Error('Bilinmeyen hata') };
    }

    componentDidCatch(error, info) {
        console.error('[embed]', error, info?.componentStack);
        // Oyun ağacı söküldü, onun `back` dinleyicileri de gitti: hata
        // ekranında Android geri tuşu oyundan çıkarsın.
        if (!this.unsubBack) {
            this.unsubBack = onNativeMessage((m) => {
                if (m.type === 'back') postToNative('exit');
            });
        }
        if (isChunkLoadError(error) && reloadOnceForChunkError()) return;
        postToNative('error', { message: 'Oyun beklenmedik şekilde durdu.' });
    }

    componentWillUnmount() {
        this.unsubBack?.();
        this.unsubBack = null;
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div
                role="alert"
                className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0b1030] via-[#25185a] to-[#43195f] px-6 text-center text-white"
                data-testid="embed-error"
            >
                <h1 className="text-xl font-black">Bir şeyler ters gitti</h1>
                <p className="max-w-xs text-sm text-white/75">Oyun beklenmedik şekilde durdu. Yeniden yüklemek çoğu zaman sorunu çözer.</p>
                <div className="flex w-full max-w-xs flex-col gap-2.5">
                    <button type="button" onClick={() => window.location.reload()} className={`${btn} bg-gradient-to-r from-coral to-orange-400 text-white`}>
                        Yeniden yükle
                    </button>
                    <button type="button" onClick={() => postToNative('exit')} className={`${btn} bg-white/10 text-white ring-1 ring-white/15`}>
                        Oyundan çık
                    </button>
                </div>
            </div>
        );
    }
}

export default EmbedErrorBoundary;
