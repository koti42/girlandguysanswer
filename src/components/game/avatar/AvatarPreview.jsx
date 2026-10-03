import React, { useEffect, useRef, useState } from 'react';
import { LuHand } from 'react-icons/lu';
import AvatarBust from './AvatarBust';
import { loadAvatarViewer } from './viewerLoader';
import { hasWebGL2, prefersReducedMotion } from './avatarUtils';

/*
 * Döndürülebilir 3D karakter önizlemesi (src/game/avatar/viewer.js).
 *
 * Görüntüleyici dinamik yüklenir (three.js ayrı parça). WebGL2 yoksa, parça
 * yüklenemezse ya da görüntüleyici onReady(false) derse 2D portreye
 * (AvatarBust) düşer; ilk 3D kare çizilene kadar da portre görünür, boş kutu
 * hiç görünmez. Yapılandırma değişince yalnızca setConfig çağrılır (sahne
 * yeniden kurulmaz).
 */
const AvatarPreview = ({ config, gender, className = '', transparent = true, label = 'Karakter önizlemesi' }) => {
    const hostRef = useRef(null);
    const viewerRef = useRef(null);
    const configRef = useRef(config);
    const [use3d] = useState(() => hasWebGL2());
    const [mode, setMode] = useState(use3d ? 'loading' : '2d');
    const configKey = JSON.stringify(config ?? null);

    // Yapılandırma -> görüntüleyici. Montajda ilk effect: configRef hazır olur.
    useEffect(() => {
        const next = JSON.parse(configKey);
        configRef.current = next;
        viewerRef.current?.setConfig(next);
    }, [configKey]);

    useEffect(() => {
        if (!use3d) return undefined;
        let cancelled = false;
        let viewer = null;
        loadAvatarViewer()
            .then(async (mod) => {
                if (cancelled || !hostRef.current) return;
                viewer = await mod.createAvatarViewer({
                    container: hostRef.current,
                    config: configRef.current,
                    transparent,
                    autoRotate: !prefersReducedMotion(),
                    onReady: (ok) => {
                        if (!cancelled) setMode(ok ? '3d' : '2d');
                    },
                });
                if (cancelled) {
                    viewer?.destroy?.();
                    viewer = null;
                    return;
                }
                viewerRef.current = viewer;
                // Yükleme sürerken seçim değiştiyse.
                viewer?.setConfig?.(configRef.current);
            })
            .catch((err) => {
                console.error('[avatar] 3D önizleme yüklenemedi', err);
                if (!cancelled) setMode('2d');
            });
        return () => {
            cancelled = true;
            viewerRef.current = null;
            viewer?.destroy?.();
        };
    }, [use3d, transparent]);

    return (
        <div className={`relative overflow-hidden ${className}`} data-testid="avatar-preview" data-mode={mode}>
            <div ref={hostRef} className="absolute inset-0" />
            {mode !== '3d' && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                    <AvatarBust
                        config={config}
                        gender={gender}
                        label={label}
                        className={`h-full max-h-72 w-auto max-w-full drop-shadow-xl ${mode === 'loading' ? 'opacity-80' : 'game-float'}`}
                    />
                    {mode === 'loading' && (
                        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/30 px-3 py-1 text-[11px] font-semibold text-white/80" role="status">
                            3D yükleniyor…
                        </span>
                    )}
                </div>
            )}
            {mode === '3d' && (
                <span className="pointer-events-none absolute bottom-2 left-1/2 inline-flex whitespace-nowrap -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[11px] font-semibold text-white/85">
                    <LuHand aria-hidden="true" /> Döndürmek için sürükle
                </span>
            )}
        </div>
    );
};

export default AvatarPreview;
