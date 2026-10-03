/*
 * Renk paleti (three bağımsız).
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
 * Gökyüzü/ortam paletleri: altın saat (gündüz), alacakaranlık (v1'in
 * gün batımı) ve gece. Motor gece payına (0..1) göre aralarında geçiş yapar
 * (bkz. ambience.js, stage.setAmbience). Işık şiddetleri de burada.
 */
export const SKY_PALETTES = {
    day: {
        skyTop: 0x3f6fd6, skyMid: 0x86a2ee, skyLow: 0xf3b3cc, horizon: 0xffc27a, fog: 0xd99fb6,
        hemiSky: 0xc7d4ff, hemiGround: 0x9a7068, hemi: 2.5, key: 0xfff0dc, keyI: 1.9, rim: 0xffc68a, rimI: 1.1,
        windows: 0.4, road: 1.18, sun: 1, stars: 0, moon: 0,
    },
    dusk: {
        skyTop: SCENE_COLORS.skyTop, skyMid: SCENE_COLORS.skyMid, skyLow: SCENE_COLORS.skyLow, horizon: SCENE_COLORS.horizon, fog: SCENE_COLORS.fog,
        hemiSky: 0x9d8cff, hemiGround: 0x5a2a3a, hemi: 2.1, key: 0xc7d2ff, keyI: 1.5, rim: 0xff8a7a, rimI: 1.6,
        windows: 1.15, road: 0.85, sun: 1, stars: 0.75, moon: 0,
    },
    night: {
        skyTop: 0x03061a, skyMid: 0x0f0c36, skyLow: 0x2c1250, horizon: 0xb93a74, fog: 0x231040,
        hemiSky: 0x7466ff, hemiGround: 0x3a1a3a, hemi: 1.75, key: 0xa9b8ff, keyI: 1.15, rim: 0xff6ad5, rimI: 1.45,
        windows: 1.45, road: 0.72, sun: 0, stars: 1, moon: 1,
    },
    // Tünel içi: koyu mor sis, düşük ortam ışığı.
    tunnelFog: 0x0d0a24,
};
