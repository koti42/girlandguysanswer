/*
 * Renk paleti (three bağımsız; arayüz karakter seçicide de kullanabilir).
 *
 * Sitenin coral (#FF6B6B) / gold (#E2B94C) vurguları ve Oyun Merkezi'nin
 * lacivert -> mor zemini üzerine kurulu bir gün batımı/neon cadde.
 */

export const SCENE_COLORS = {
    skyTop: 0x070b24,
    skyMid: 0x1d1450,
    skyLow: 0x5b1d63,
    horizon: 0xff6b6b,
    fog: 0x3a1650,
    sunTop: 0xffd36b,
    sunBottom: 0xff4f8b,
    skylineFar: 0x2a1546,
    skylineNear: 0x1a0f33,
    asphalt: '#262341',
    coral: 0xff6b6b,
    gold: 0xe2b94c,
    // Kapı şeritleri: arayüzdeki soru paneliyle aynı renkler (pembe/mor/mavi).
    gateLanes: [0xff4fa3, 0xa855f7, 0x38bdf8],
    correct: 0x34f5a0,
    wrong: 0xff3b5c,
};

/*
 * Karakter paletleri (0..3). hoodie = arayüzde renk örneği olarak gösterilebilecek ana renk.
 */
export const CHARACTER_PALETTES = [
    { name: 'Mercan', hoodie: 0xff6b6b, trim: 0xffe1d6, pants: 0x2b2d5c, shoes: 0xffffff, sole: 0xe2b94c, skin: 0xf1c3a1, hair: 0x3b2418, cap: 0x2b2d5c },
    { name: 'Altın', hoodie: 0xe2b94c, trim: 0x3a2a12, pants: 0x1c1c28, shoes: 0xff6b6b, sole: 0xffffff, skin: 0xd59a72, hair: 0x15110f, cap: 0xff6b6b },
    { name: 'Nane', hoodie: 0x2dd4bf, trim: 0xe7fffb, pants: 0x4c2a85, shoes: 0xf8fafc, sole: 0x2dd4bf, skin: 0xffd7bd, hair: 0x8a3b1c, cap: 0x4c2a85 },
    { name: 'Lavanta', hoodie: 0x8b5cf6, trim: 0xf3e8ff, pants: 0x3f4458, shoes: 0xff4fa3, sole: 0xffffff, skin: 0x8e5a3c, hair: 0xe9c46a, cap: 0xff4fa3 },
];

/** Geçersiz karakter girdisini güvenli varsayılana çevirir. */
export function normalizeCharacter(character) {
    const body = character?.body === 'erkek' ? 'erkek' : 'kiz';
    const p = Number(character?.palette);
    const palette = Number.isInteger(p) && p >= 0 && p < CHARACTER_PALETTES.length ? p : 0;
    return { body, palette };
}
