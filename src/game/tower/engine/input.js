/*
 * Girdi: tek dokunuş. Sahnenin herhangi bir yerine dokunma / tıklama,
 * Space ya da Enter katı bırakır (onTap). Soru açıkken ← / 1 / A ilk şık,
 * → / 2 / B ikinci şık (onChoice); şıklar arayüzde de büyük butonlar.
 *
 * Arayüz düğmeleri (HUD, soru paneli, menüler) sahnenin kardeşi olduğu için
 * onlara dokunuş buraya ulaşmaz; yine de etkileşimli bir öğe üstündeki
 * dokunuş ve odaktaki düğmede Enter/Space yok sayılır (düğmenin kendisine
 * basılsın, kat düşmesin). Basılı tutulan tuş (repeat) tekrar bırakmaz.
 *
 * onGesture (ses kilidi) her kullanıcı jestinde: keydown, pointerdown,
 * dokunmatik pointerup ve touchend (iOS kilidi yalnızca bunlarla açar).
 */

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [role="switch"], [contenteditable], [data-no-tap]';

const TAP_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);
const CHOICE_KEYS = { ArrowLeft: 0, Digit1: 0, Numpad1: 0, KeyA: 0, ArrowRight: 1, Digit2: 1, Numpad2: 1, KeyB: 1 };

function isInteractive(target) {
    return Boolean(target && typeof target.closest === 'function' && target.closest(INTERACTIVE));
}

/** Tuş olayından eylem: { kind: 'tap' } | { kind: 'choice', choice } | null (saf; test edilir). */
export function keyAction(e) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey) return null;
    const code = e.code || '';
    if (TAP_KEYS.has(code) || e.key === ' ' || e.key === 'Enter') return { kind: 'tap' };
    if (Object.prototype.hasOwnProperty.call(CHOICE_KEYS, code)) return { kind: 'choice', choice: CHOICE_KEYS[code] };
    return null;
}

export function createInput({ container, canvas, onTap, onChoice, onPauseKey, onGesture, isActive }) {
    function onKeyDown(e) {
        const act = keyAction(e);
        if (act) {
            // Odak bir düğmedeyse Enter/Space düğmenin kendisine ait.
            if (isInteractive(e.target) && act.kind === 'tap') return;
            if (isActive()) e.preventDefault();
            if (e.repeat) return;
            onGesture?.();
            if (act.kind === 'tap') onTap();
            else onChoice?.(act.choice);
            return;
        }
        if (onPauseKey && (e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (isActive()) {
                e.preventDefault();
                onPauseKey();
            }
        }
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.isPrimary === false) return;
        const t = e.target;
        if (t && t !== canvas && isInteractive(t)) return;
        onGesture?.();
        onTap();
    }

    function onPointerUp(e) {
        if (e.pointerType !== 'mouse') onGesture?.();
    }

    function onTouchEnd() {
        onGesture?.();
    }

    // Uzun basış/çift dokunuş yakınlaştırması ve kaydırma olmasın.
    function onTouchMove(e) {
        if (e.target === canvas && e.cancelable) e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    container.addEventListener('pointerdown', onPointerDown);
    container.addEventListener('pointerup', onPointerUp, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    const prevTouchAction = container.style.touchAction;
    container.style.touchAction = 'none';

    return {
        dispose() {
            window.removeEventListener('keydown', onKeyDown);
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointerup', onPointerUp);
            container.removeEventListener('touchend', onTouchEnd);
            canvas.removeEventListener('touchmove', onTouchMove);
            container.style.touchAction = prevTouchAction;
        },
    };
}
