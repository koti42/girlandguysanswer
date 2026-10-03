/*
 * Girdi: klavye (oklar, WASD, Space; Esc/P duraklat) ve dokunmatik/fare
 * kaydırma. Komutlar onAction('L'|'R'|'J'|'S') ile oyuna gider; oyun
 * duraklatılmışsa ya da koşu yoksa kendisi yok sayar (kaydedilmez).
 *
 * Kaydırmalar sayfayı kaydırmasın diye canvas'ta touch-action:none ve
 * touchmove'da preventDefault. Arayüz düğmeleri (button, a, input...)
 * üzerindeki dokunuşlar kaydırma sayılmaz.
 *
 * onGesture (ses kilidini açar) her kullanıcı jestinde çağrılır: keydown,
 * pointerdown, dokunmatik/kalem pointerup ve touchend. iOS Safari kilidi
 * yalnızca pointerup/touchend ile açtığından sonuncular şart.
 */
import { createSwipeRecognizer } from './swipe.js';

const KEY_MAP = {
    ArrowLeft: 'L', KeyA: 'L',
    ArrowRight: 'R', KeyD: 'R',
    ArrowUp: 'J', KeyW: 'J', Space: 'J',
    ArrowDown: 'S', KeyS: 'S',
};

const INTERACTIVE = 'button, a, input, textarea, select, label, [role="button"], [contenteditable], [data-no-swipe]';

function isEditable(target) {
    if (!target || typeof target.closest !== 'function') return false;
    return Boolean(target.closest('input, textarea, select, [contenteditable]'));
}

export function createInput({ container, canvas, onAction, onPauseKey, onGesture, isActive }) {
    const swipe = createSwipeRecognizer();

    function onKeyDown(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (isEditable(e.target)) return;
        const code = KEY_MAP[e.code] || KEY_MAP[e.key];
        if (code) {
            // Koşu sürerken oklar/Space sayfayı kaydırmasın, odaktaki düğmeye basmasın.
            if (isActive()) e.preventDefault();
            if (e.repeat) return;
            onGesture?.();
            onAction(code);
            return;
        }
        if (onPauseKey && (e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) {
            if (isActive()) {
                e.preventDefault();
                onPauseKey();
            }
        }
    }

    function onPointerDown(e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const t = e.target;
        if (t && t !== canvas && typeof t.closest === 'function' && t.closest(INTERACTIVE)) return;
        onGesture?.();
        swipe.begin(e.pointerId, e.clientX, e.clientY);
    }

    function onPointerMove(e) {
        if (!swipe.isTracking()) return;
        const code = swipe.move(e.pointerId, e.clientX, e.clientY);
        if (code) onAction(code);
    }

    function onPointerEnd(e) {
        // iOS'ta dokunmatik pointerdown kullanıcı etkinleştirmesi sayılmaz; ses
        // kilidi ancak parmak kalkınca (pointerup/touchend) açılır. pointercancel
        // jest değildir, orada açma.
        if (e.type === 'pointerup' && e.pointerType !== 'mouse') onGesture?.();
        swipe.end(e.pointerId);
    }

    // Yedek: bazı WebKit sürümlerinde Web Audio kilidi yalnızca touchend ile
    // açılır. Container'da dinlenir ki HUD katmanına dokunuşlar da sayılsın.
    function onTouchEnd() {
        onGesture?.();
    }

    function onTouchMove(e) {
        if (e.target === canvas && e.cancelable) e.preventDefault();
    }

    window.addEventListener('keydown', onKeyDown);
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerEnd, { passive: true });
    window.addEventListener('pointercancel', onPointerEnd, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    const prevTouchAction = container.style.touchAction;
    container.style.touchAction = 'none';

    return {
        reset() {
            swipe.reset();
        },
        dispose() {
            window.removeEventListener('keydown', onKeyDown);
            container.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerEnd);
            window.removeEventListener('pointercancel', onPointerEnd);
            canvas.removeEventListener('touchmove', onTouchMove);
            container.removeEventListener('touchend', onTouchEnd);
            container.style.touchAction = prevTouchAction;
        },
    };
}
