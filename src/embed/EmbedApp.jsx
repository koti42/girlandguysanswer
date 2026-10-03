import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { LuDoorOpen, LuTriangleAlert } from 'react-icons/lu';
import EmbedErrorBoundary from './EmbedErrorBoundary';
import { applySafeArea, createHaptics, onNativeMessage, postToNative, readGame, readNativeConfig } from './bridge';
import { createEmbedApi } from './embedApi';

/*
 * Her mod ayrı parça: karakter önizlemesi koşu arayüzünü, koşu karakter
 * görüntüleyicisini indirmez (WebView'da ilk açılış hızlı olsun).
 */
const EmbedRunner = lazy(() => import('./EmbedRunner'));
const EmbedAvatar = lazy(() => import('./EmbedAvatar'));
const EmbedTower = lazy(() => import('./EmbedTower'));

// Parça inerken: koşu/kule koyu zemin + dönen halka; karakter önizlemesi şeffaf kalır.
const Loading = ({ transparent }) =>
    transparent ? null : (
        <div className="fixed inset-0 flex items-center justify-center bg-[#0b1030]" role="status" aria-label="Yükleniyor">
            <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-coral border-t-transparent" />
        </div>
    );

const UnknownGame = () => {
    useEffect(
        () =>
            onNativeMessage((msg) => {
                if (msg.type === 'back') postToNative('exit');
            }),
        []
    );
    return (
        <div
            role="alert"
            className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0b1030] via-[#25185a] to-[#43195f] px-6 text-center text-white"
        >
            <LuTriangleAlert className="text-4xl text-amber-300" aria-hidden="true" />
            <h1 className="text-xl font-black">Oyun bulunamadı</h1>
            <p className="max-w-xs text-sm text-white/75">Bu bağlantı geçerli bir oyunu açmıyor. Uygulamayı güncelleyip tekrar dene.</p>
            <button
                type="button"
                onClick={() => postToNative('exit')}
                className="flex min-h-[52px] w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-white/10 px-5 font-bold text-white ring-1 ring-white/15 game-press"
            >
                <LuDoorOpen aria-hidden="true" /> Oyundan çık
            </button>
        </div>
    );
};

/**
 * Gömülü oyun kökü (embed.html). Site kabuğu yok: AuthContext, Router,
 * başlık/altbilgi, reklam, yaş/cinsiyet kapıları, mesaj kutusu yüklenmez.
 * Kimlik ve tercihler native'in enjekte ettiği __HS_NATIVE__'den (yalnızca
 * bellekte), oyun ?game= parametresinden: kosu | kule | avatar.
 *
 * Testler config / game / api'yi doğrudan verebilir.
 */
const EmbedApp = ({ config: configProp, game: gameProp, api: apiProp }) => {
    const [config] = useState(() => configProp ?? readNativeConfig());
    const [game] = useState(() => (gameProp !== undefined ? gameProp : readGame()));
    // Token yalnızca bu kapanışta: localStorage'a hiç yazılmaz.
    const [api] = useState(() => apiProp ?? createEmbedApi(() => config.token));
    const [haptic] = useState(() => createHaptics({ enabled: config.haptics }));
    const readyRef = useRef(false);

    useEffect(() => {
        applySafeArea(config.safeArea);
    }, [config]);

    useEffect(() => {
        const root = document.documentElement;
        root.classList.toggle('hs-embed-transparent', game === 'avatar');
        // Karakter önizlemesi `ready`'yi ilk görüntü hazır olunca kendisi gönderir.
        if (game === 'avatar' || readyRef.current) return;
        readyRef.current = true;
        if (game) postToNative('ready', { game });
        else postToNative('error', { message: 'Bilinmeyen oyun.' });
    }, [game]);

    let content;
    if (game === 'kosu') content = <EmbedRunner config={config} api={api} haptic={haptic} />;
    else if (game === 'avatar') content = <EmbedAvatar config={config} />;
    else if (game === 'kule') content = <EmbedTower config={config} api={api} haptic={haptic} />;
    else content = <UnknownGame />;

    return (
        <EmbedErrorBoundary>
            <Suspense fallback={<Loading transparent={game === 'avatar'} />}>{content}</Suspense>
        </EmbedErrorBoundary>
    );
};

export default EmbedApp;
