import React from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from './chunkReload';

/*
 * Çizim hatası sınırı. React.lazy ile yüklenen sayfa parçası inemezse
 * (yeni sürüm yayınlandıktan sonra eski index.html ile açık kalan sekmede
 * hash'li dosya 404) ya da bir bileşen çizimde hata fırlatırsa React kökü
 * sökülüp sayfa bembeyaz kalıyordu. Bu sınır yerine sade bir ekran gösterir.
 *
 * - resetKey değişince (ör. adres) hata durumu sıfırlanır: başka sayfaya
 *   geçen kullanıcı hata ekranında takılı kalmaz.
 * - Yedek ekran Router bağlamına dayanmaz (düz <a href>): sınır Router'ın
 *   dışında da kullanılabilir.
 * - Parça yükleme hatasında sayfa bir kez kendiliğinden yenilenir;
 *   sessionStorage'daki zaman damgası sonsuz yenileme döngüsünü önler.
 */

const btn =
    'inline-flex min-h-[48px] items-center justify-center rounded-2xl px-5 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null, resetKey: props.resetKey };
    }

    static getDerivedStateFromError(error) {
        return { error: error || new Error('Bilinmeyen hata') };
    }

    static getDerivedStateFromProps(props, state) {
        if (props.resetKey !== state.resetKey) {
            return { error: null, resetKey: props.resetKey };
        }
        return null;
    }

    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info?.componentStack);
        try {
            this.props.onError?.(error, info);
        } catch {
            // raporlama hatası ekranı bozmasın
        }
        if (isChunkLoadError(error)) reloadOnceForChunkError();
    }

    render() {
        if (!this.state.error) return this.props.children;
        const { homeHref = '/', homeLabel = 'Ana sayfaya dön' } = this.props;
        return (
            <div
                role="alert"
                className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 py-10 text-center text-slate-800 dark:text-slate-100"
                data-testid="error-boundary"
            >
                <h1 className="text-xl font-black">Bir şeyler ters gitti</h1>
                <p className="max-w-md text-sm text-slate-600 dark:text-slate-300">
                    Sayfa beklenmedik şekilde durdu. Yenilemek çoğu zaman sorunu çözer.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => window.location.reload()} className={`${btn} bg-gradient-to-r from-coral to-orange-400 text-white`}>
                        Sayfayı yenile
                    </button>
                    <a href={homeHref} className={`${btn} bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-white`}>
                        {homeLabel}
                    </a>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
