/*
 * "Zero-Day Breach Override" mini oyunu — saf durum makinesi (React bilmez, test edilebilir).
 *
 * 5×5 veri matrisinde kızıl "bozuk veri" hücreleri her ~1,1 sn yer değiştirir (2-4 adet).
 * Bozuk hücreye dokunmak hit; hedefe ulaşınca başarı. Mavi hücreye dokunmak miss; 3. miss'te ya da süre
 * bitince başarısız.
 */
import { createRng } from './rng';

export const GRID = 5;
export const MAX_MISSES = 3;

export function createBreachState({ seed = Date.now(), targets = 8, seconds = 12, shuffleEvery = 1.1 } = {}) {
    const st = {
        rng: createRng(seed),
        targets,
        seconds,
        remaining: seconds,
        hits: 0,
        misses: 0,
        bad: new Set(),
        shuffleEvery,
        untilShuffle: 0,
        done: null, // null | 'success' | 'fail'
        lastCell: null,
        lastKind: null,
    };
    shuffle(st);
    return st;
}

export function shuffle(st) {
    const count = 2 + Math.floor(st.rng() * 3);
    const next = new Set();
    let guard = 0;
    while (next.size < count && guard++ < 100) {
        const idx = Math.floor(st.rng() * GRID * GRID);
        if (!st.bad.has(idx) || st.rng() < 0.3) next.add(idx);
    }
    st.bad = next;
    st.untilShuffle = st.shuffleEvery;
}

/** Zamanı ilerletir; bitişte 'success' | 'fail', aksi halde null. */
export function advance(st, dt) {
    if (st.done) return st.done;
    st.remaining -= dt;
    st.untilShuffle -= dt;
    if (st.untilShuffle <= 0) shuffle(st);
    if (st.remaining <= 0) {
        st.remaining = 0;
        st.done = 'fail';
    }
    return st.done;
}

/** Hücreye dokunuş: 'hit' | 'miss' | null (bitmiş). */
export function tap(st, idx) {
    if (st.done) return null;
    st.lastCell = idx;
    if (st.bad.has(idx)) {
        st.bad.delete(idx);
        st.hits += 1;
        st.lastKind = 'hit';
        if (st.hits >= st.targets) st.done = 'success';
        else if (st.bad.size === 0) shuffle(st);
        return 'hit';
    }
    st.misses += 1;
    st.lastKind = 'miss';
    if (st.misses >= MAX_MISSES) st.done = 'fail';
    return 'miss';
}
