import { vi } from 'vitest';

/** Bileşen testleri için ortak veri ve sahte api (yalnızca test). */

export const MAP_A = {
    id: 'map-a',
    title: 'Güzel Vadi',
    description: 'Dereli bir vadi.',
    author: { id: 'u2', username: 'ayse', avatar: null, gender: 'female' },
    likes: 12,
    plays: 140,
    cover: null,
    published_at: '2026-10-10T10:00:00Z',
    liked_by_me: false,
    mine: false,
};
export const MAP_B = { ...MAP_A, id: 'map-b', title: 'Kristal Kule', author: { id: 'u3', username: 'can', avatar: null, gender: 'male' }, likes: 3, plays: 9 };
export const MAP_C = { ...MAP_A, id: 'map-c', title: 'Ada Köyü', likes: 40, plays: 300 };

export const MINE_PRIVATE = { ...MAP_A, id: 'mine-1', title: 'Evim', author: { id: 'me', username: 'ben' }, mine: true, visibility: 'private', status: 'ok', block_count: 1536, reports: 0 };
export const MINE_PUBLIC = { ...MINE_PRIVATE, id: 'mine-2', title: 'Açık Harita', visibility: 'public', published_at: '2026-10-11T10:00:00Z' };
export const MINE_HIDDEN = { ...MINE_PRIVATE, id: 'mine-3', title: 'İncelenen', visibility: 'public', status: 'hidden', reports: 3 };

export const PROFILE_3_OF_5 = { map_slots: 5, maps_used: 3, slots_free: 2, slot_price: 10000, slot_pack: 5 };

export const httpError = (status, data, message) => Object.assign(new Error(`http ${status}`), { response: { status, data: { success: false, message, data } } });

export const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

/** kesifApi biçiminde sahte istemci; her fonksiyon vi.fn. */
export function fakeApi(overrides = {}) {
    return {
        overview: vi.fn(() => Promise.resolve({ profile: PROFILE_3_OF_5, wallet: { balance: 12000 }, stats: {}, community: { top: [] }, claimed: [], cloud_save: { exists: false } })),
        maps: vi.fn(() => Promise.resolve({ maps: [MAP_A, MAP_B], pagination: { current_page: 1, last_page: 1, per_page: 20, total: 2 } })),
        mine: vi.fn(() => Promise.resolve({ maps: [MINE_PRIVATE, MINE_PUBLIC, MINE_HIDDEN], profile: PROFILE_3_OF_5 })),
        map: vi.fn(),
        createMap: vi.fn(),
        updateMap: vi.fn(),
        deleteMap: vi.fn(() => Promise.resolve({ profile: { ...PROFILE_3_OF_5, maps_used: 2, slots_free: 3 } })),
        publish: vi.fn((id) => Promise.resolve({ map: { ...MINE_PRIVATE, id, visibility: 'public' } })),
        unpublish: vi.fn((id) => Promise.resolve({ map: { ...MINE_PUBLIC, id, visibility: 'private' } })),
        like: vi.fn(() => Promise.resolve({ liked: true, likes: 13 })),
        report: vi.fn(() => Promise.resolve({ reported: true, duplicate: false, hidden: false })),
        play: vi.fn(() => Promise.resolve({ counted: true, plays: 141 })),
        buySlots: vi.fn(() =>
            Promise.resolve({ profile: { ...PROFILE_3_OF_5, map_slots: 10, slots_free: 7 }, wallet: { balance: 2000 }, purchased: 5 })
        ),
        getSave: vi.fn(),
        putSave: vi.fn(),
        claim: vi.fn(),
        playStart: vi.fn(() => Promise.resolve({ session: { world_code: 'ABCD1234', mode: 'macera', play_seconds: 0, elapsed_seconds: 0, claims: 0 }, created: true })),
        playPing: vi.fn(() => Promise.resolve({ session: { world_code: 'ABCD1234', mode: 'macera', play_seconds: 20, elapsed_seconds: 20, claims: 0 }, created: false })),
        ...overrides,
    };
}
