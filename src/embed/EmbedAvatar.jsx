import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuHand } from 'react-icons/lu';
import AvatarBust from '../components/game/avatar/AvatarBust';
import { loadAvatarViewer } from '../components/game/avatar/viewerLoader';
import { hasWebGL2, prefersReducedMotion } from '../components/game/avatar/avatarUtils';
import { normalizeAvatar } from '../game/avatar/catalog';
import { onNativeMessage, postToNative } from './bridge';

/**
 * Mobil karakter editörünün üstündeki 3D önizleme (?game=avatar). Arka plan
 * şeffaf: native editör kendi degradesini çizer. Native her seçimde
 * `setAvatar` gönderir; sahne yeniden kurulmaz, yalnızca setConfig.
 * WebGL 2 yoksa ya da görüntüleyici açılamazsa 2D portre (AvatarBust).
 * `ready`, ilk görüntü (3D ya da 2D) hazır olunca gönderilir: native o ana
 * kadar kendi SVG portresini gösterir.
 */
const EmbedAvatar = ({ config }) => {
    const gender = config.user?.gender;
    const [avatar, setAvatar] = useState(() => normalizeAvatar(config.avatar, gender));
    const [use3d] = useState(hasWebGL2);
    const [mode, setMode] = useState(() => (use3d ? 'loading' : '2d'));
    const hostRef = useRef(null);
    const viewerRef = useRef(null);
    const avatarRef = useRef(avatar);
    const readyRef = useRef(false);

    const announceReady = useCallback(() => {
        if (readyRef.current) return;
        readyRef.current = true;
        postToNative('ready', { game: 'avatar' });
    }, []);
    const markReady = useCallback(
        (m) => {
            setMode(m);
            announceReady();
        },
        [announceReady]
    );

    useEffect(() => {
        if (!use3d) {
            // 2D portre zaten çizili.
            announceReady();
            return undefined;
        }
        let cancelled = false;
        let viewer = null;
        loadAvatarViewer()
            .then(async (mod) => {
                if (cancelled || !hostRef.current) return;
                viewer = await mod.createAvatarViewer({
                    container: hostRef.current,
                    config: avatarRef.current,
                    transparent: true,
                    autoRotate: !prefersReducedMotion(),
                    onReady: (ok) => {
                        if (!cancelled) markReady(ok ? '3d' : '2d');
                    },
                });
                if (cancelled) {
                    viewer?.destroy?.();
                    viewer = null;
                    return;
                }
                viewerRef.current = viewer;
                // Yükleme sürerken native yeni seçim gönderdiyse.
                viewer?.setConfig?.(avatarRef.current);
            })
            .catch((err) => {
                console.error('[embed] 3D önizleme yüklenemedi', err);
                if (!cancelled) markReady('2d');
            });
        return () => {
            cancelled = true;
            viewerRef.current = null;
            viewer?.destroy?.();
        };
    }, [use3d, markReady, announceReady]);

    useEffect(
        () =>
            onNativeMessage((msg) => {
                if (msg.type === 'setAvatar') {
                    const next = normalizeAvatar(msg.avatar, gender);
                    avatarRef.current = next;
                    setAvatar(next);
                    viewerRef.current?.setConfig?.(next);
                } else if (msg.type === 'back') {
                    postToNative('exit');
                }
            }),
        [gender]
    );

    return (
        <div className="fixed inset-0 overflow-hidden" data-testid="embed-avatar" data-mode={mode}>
            <div ref={hostRef} className="absolute inset-0" />
            {mode !== '3d' && (
                <div className="absolute inset-0 flex items-center justify-center p-6">
                    <AvatarBust
                        config={avatar}
                        gender={gender}
                        label="Karakter önizlemesi"
                        className={`h-full max-h-80 w-auto max-w-full drop-shadow-xl ${mode === 'loading' ? 'opacity-80' : 'game-float'}`}
                    />
                </div>
            )}
            {mode === '3d' && (
                <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.5rem,var(--hs-safe-bottom,env(safe-area-inset-bottom)))] flex justify-center">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] font-semibold text-white/85 game-fade-up">
                        <LuHand aria-hidden="true" /> Döndürmek için sürükle
                    </span>
                </div>
            )}
        </div>
    );
};

export default EmbedAvatar;
