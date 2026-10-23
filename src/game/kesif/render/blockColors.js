/*
 * KEŞİF render — blok → temsili renk (saf; three yok).
 *
 * Kırılma parçacıkları ve yerleştirme hayaleti, atlas dokusuna bağlı olmadan blok rengini buradan alır.
 * Kural tablosu doku adlarına (blocks.js tileNames) bakar; bulunamazsa blok ses sınıfından türetilir.
 */
import { BLOCK_COLORS, RUNES, getBlock } from '../sim/blocks.js';
import { foldTr } from '../sim/constants.js';

const STONE = 0x8a8c90;
const DARK_STONE = 0x4a4c52;

/** [doku adı kalıbı (katlanmış), ana renk, ikinci renk | null]. İlk eşleşen kazanır. */
const RULES = [
  [/^cimen_ust/, 0x6fae45, 0x5a9a38],
  [/^cimen_yan/, 0x7a5230, 0x6fae45],
  [/^cim_kar_yan/, 0xf2f6fa, 0x7a5230],
  [/^toprak/, 0x7a5230, 0x6a4526],
  [/^kar/, 0xf2f6fa, 0xdce8f2],
  [/^kizil_kum/, 0xc4693a, 0xa8552e],
  [/^kum$/, 0xe2d29a, 0xcdbd84],
  [/^cakil/, 0x8a8782, 0x6a6762],
  [/^kaygan_buz/, 0xc8ecff, 0x9ad4f0],
  [/^buz/, 0xa8d8f2, 0x88c0e0],
  [/^kil$/, 0x9aa4b4, 0x8690a2],
  [/^kumtasi/, 0xd2bd88, 0xbca572],
  [/^bazalt/, 0x4a4a52, 0x35353c],
  [/^kristal_kaya/, 0x7a8ad8, 0x9ab0ff],
  [/^camur/, 0x5a4332, 0x4a3526],
  [/^kanyon/, 0xb0643a, 0x8e4c2a],
  [/^kitaplik/, 0x8a5a30, 0xc8a060],
  [/^levha/, 0xb08a50, 0x8a6a38],
  [/^akan_su|^su$/, 0x3a8fd9, 0x6ab4f0],
  [/^akan_lav|^lav$/, 0xff7a22, 0xffc040],
  [/^cevher_komur/, STONE, 0x2a2a2e],
  [/^cevher_bakir/, STONE, 0xd1773f],
  [/^cevher_demir/, STONE, 0xd8b8a0],
  [/^cevher_altin/, STONE, 0xf4c940],
  [/^cevher_elmas/, STONE, 0x4fe3d6],
  [/^cevher_kuantum/, STONE, 0xb25cff],
  [/^cevher_kiziltas/, STONE, 0xd0302a],
  [/^cevher_zumrut/, STONE, 0x3fd070],
  [/^ametist/, 0xb06ae8, 0x8a4ac8],
  [/^bakir_blogu/, 0xd1773f, 0xb06030],
  [/^demir_blogu/, 0xd6d9dd, 0xb0b4b8],
  [/^altin_blogu/, 0xf4c940, 0xd8a820],
  [/^elmas_blogu/, 0x4fe3d6, 0x30b8ac],
  [/^kuantum_blogu/, 0xb25cff, 0x8a3ad8],
  [/^isik_blogu/, 0xfff2a8, 0xffd860],
  [/^ziplama/, 0x3fd0a0, 0x2aa880],
  [/^kutuk_mese/, 0x6a4a2a, 0x8a6a3a],
  [/^kutuk_hus/, 0xe0d8c8, 0x3a3a3a],
  [/^kutuk_cam/, 0x4a3420, 0x6a4a30],
  [/^kutuk_akasya/, 0x8a6a4a, 0xa8845a],
  [/^tahta_mese/, 0xb08a50, 0x8a6a38],
  [/^tahta_hus/, 0xd8c898, 0xb8a878],
  [/^tahta_cam/, 0x8a6a3a, 0x6a4e28],
  [/^tahta_akasya/, 0xc86a3a, 0xa8522a],
  [/^yaprak_mese/, 0x4f8f35, 0x3a7a28],
  [/^yaprak_hus/, 0x7aa84a, 0x5a8a38],
  [/^yaprak_cam/, 0x2f6a3a, 0x24552e],
  [/^yaprak_akasya/, 0x7a9a3a, 0x5a7a2a],
  [/^fidan_mese/, 0x4f8f35, 0x6a4a2a],
  [/^fidan_hus/, 0x7aa84a, 0xe0d8c8],
  [/^fidan_cam/, 0x2f6a3a, 0x4a3420],
  [/^fidan_akasya/, 0x7a9a3a, 0x8a6a4a],
  [/^gelincik/, 0xd8322f, 0x3c8a30],
  [/^sari_cicek/, 0xf2c91e, 0x3c8a30],
  [/^uzun_ot/, 0x5ea63a, 0x4a8a2c],
  [/^cali/, 0x3c8a30, 0xe0386b],
  [/^kaktus/, 0x3f8a3a, 0x2f6a2a],
  [/^isikli_mantar/, 0x6af0d0, 0x3aa8b0],
  [/^yosun/, 0x4f8f35, 0x3a7a28],
  [/^sarmasik/, 0x3c8a30, 0x2a6a24],
  [/^tas_tugla/, 0x9a9ca0, 0x7a7c80],
  [/^tugla/, 0xb5533c, 0x8a3e2c],
  [/^cilali_tas/, 0xb0b2b6, 0x92949a],
  [/^sutun/, 0xc8c8c4, 0xa8a8a4],
  [/^fener/, 0xffd070, 0x6a5030],
  [/^mesale/, 0xffa030, 0x6a4a28],
  [/^sandik/, 0x8a5a30, 0xc8a060],
  [/^tezgah/, 0xa07040, 0x7a5028],
  [/^ocak/, 0x707074, 0x4a4a4e],
  [/^kapi/, 0x9a6a38, 0x7a5028],
  [/^yatak/, 0xc8402f, 0xe8e0d0],
  [/^ana_kaya/, 0x2a2a2e, 0x1a1a1e],
  [/^muhur/, 0x8ad0ff, 0xc8ecff],
  [/^plaka/, 0x8a8c90, 0x6a6c70],
  [/^kol/, 0x9a9ca0, 0xb85a3a],
  [/^mantik/, 0x60606a, 0x8aa0c8],
  [/^alici/, 0xb8e0ff, 0x6ab0e8],
  [/^ayna/, 0xdfe8f0, 0xa8c0d8],
  [/^isin_kaynagi/, 0xff6a4a, 0xffb08a],
  [/^itilebilir/, 0x9a8a6a, 0x7a6a4a],
  [/^hareketli_platform/, 0x6a8aa8, 0x4a6a88],
  [/^kilitli_kapi/, 0x6a5a3a, 0xd8b040],
  [/^odul_sandigi/, 0xf0c040, 0x8a5a30],
  [/^parkur/, 0xd8b040, 0x6a6a72],
  [/^portal_mavi/, 0x3a8fff, 0x9ad0ff],
  [/^portal_turuncu/, 0xff8a2a, 0xffd090],
  [/^portal_cerceve/, 0x4a4a58, 0x6a6a7a],
  [/^boss_kapisi/, 0x5a3a6a, 0xb080e0],
  [/^sunak/, 0x8a8a96, 0xd8c0ff],
  // üretim istasyonları (kesici, dokuma) ve büyü blokları
  [/^kesici/, 0x9a9ca0, 0x6a6c70],
  [/^dokuma/, 0xa87a45, 0x7a5028],
  [/^merdiven/, 0xa87a45, 0x7a5028],
  [/^buyu_masasi/, 0x5a3aa8, 0xb88aff],
  [/^simya_kazani/, 0x4a4a52, 0x5fe08a],
  // teknoloji (sim/techData): laboratuvar ve makineler
  [/^laboratuvar/, 0xcfd6e2, 0x3ac8ff],
  [/^gunes_/, 0x1c3a78, 0x6ab0ff],
  [/^jenerator/, 0x6a7482, 0xff9a2e],
  [/^pil_/, 0x39414d, 0x7affea],
  [/^kablo/, 0x3a4250, 0x5ad7ff],
  [/^elektrikli_ocak/, 0x707074, 0xffa040],
  [/^matkap/, 0x59626f, 0xffb347],
  [/^lamba/, 0xfff2b0, 0xffd860],
  [/^isinlayici/, 0x59626f, 0x7affea],
  [/^asansor/, 0x59626f, 0xb0e0ff],
  [/^guc_kapisi/, 0x4a5262, 0x7affea],
  [/^dugme/, 0x9a9ca0, 0xe05050],
  [/^sensor/, 0x39414d, 0x7affea],
  [/^sarj_/, 0x39414d, 0x5ad7ff],
  // biyom genişletmesi (sim/biomeData): ağaçlar, mantar, buz, yanardağ, mercan, çiçekler, mağara blokları
  [/^yaprak_sonbahar_turuncu/, 0xe0731c, 0xa83c14],
  [/^yaprak_sonbahar_kirmizi/, 0xc02a22, 0x6e1414],
  [/^yaprak_sonbahar_sari/, 0xe2bc26, 0xa07a14],
  [/^yaprak_kiraz/, 0xf2a2c0, 0xc8688a],
  [/^yaprak_cangil/, 0x2f8f3a, 0x1f6a2c],
  [/^yaprak_mangrov/, 0x4f7a3a, 0x3a5a2c],
  [/^yaprak_karli_cam/, 0x2f5f40, 0xf0f4f8],
  [/^kutuk_kiraz/, 0x8e5a5a, 0x4a2a2e],
  [/^kutuk_cangil/, 0x93805c, 0x4a3a28],
  [/^kutuk_mangrov/, 0x704048, 0x2a1a1c],
  [/^tahta_kiraz/, 0xc98f86, 0xa8706a],
  [/^tahta_cangil/, 0xa8683c, 0x8a5028],
  [/^tahta_mangrov/, 0x8a3a36, 0x6a2a28],
  [/^tahta_bambu/, 0xcdb860, 0xa89a48],
  [/^mangrov_kok/, 0x7a4a4a, 0x4a2c2e],
  [/^bambu/, 0x6ea03a, 0x4a7a28],
  [/^mantar_govde/, 0xf4ecd8, 0xc8bca0],
  [/^mantar_sapka_kirmizi/, 0xe0342c, 0xfff4ea],
  [/^mantar_sapka_mor/, 0x9a52d8, 0xaef4ff],
  [/^mantar_alt/, 0xe8dcc0, 0xb8a888],
  [/^paketli_buz/, 0xaadcf8, 0x7ab4e8],
  [/^kul$/, 0x6a6a6a, 0x3a3a3a],
  [/^volkanik_cam/, 0x1c1530, 0x6a3ab8],
  [/^magma_tasi/, 0xff7a22, 0x2a1a1a],
  [/^mercan_pembe/, 0xf06a9c, 0xb8346a],
  [/^mercan_mor/, 0x9a5ae0, 0x5a2a98],
  [/^mercan_sari/, 0xf6c42a, 0xc88a10],
  [/^mercan_yelpaze/, 0xf06a9c, 0xb8346a],
  [/^egrelti/, 0x3c8a30, 0x2a6a24],
  [/^papatya/, 0xf4f6f8, 0xf2b61e],
  [/^can_cicegi/, 0x4a64ee, 0x3c8a30],
  [/^lavanta/, 0x9a66e6, 0x3c8a30],
  [/^lale/, 0xf0771c, 0x3c8a30],
  [/^sakayik/, 0xf27aa6, 0x3c8a30],
  [/^sarkit_tasi/, 0xa98c6c, 0x5a4838],
  [/^parlak_meyve/, 0xffb81e, 0x4a7a2c],
  [/^kalsit/, 0xe8ecf0, 0xc0c8d0],
  [/^miselyum_ust/, 0x9a86a8, 0x5a4a68],
  [/^miselyum_yan/, 0x7a5636, 0x9a86a8],
  [/^kuru_cali/, 0x7a5a30, 0x4a3a20],
  [/^kamis/, 0x4f7a3a, 0x7a4a28],
  [/^cicekli_yosun/, 0x3a8a30, 0xf27aa6],
  // Neon Meridyen şehir blokları (sim/cityData): yol, kaldırım, neon, pencere, cephe, holo, kayar kapı
  [/^asfalt_cizgi/, 0xe5b92d, 0x2f3239],
  [/^zebra/, 0xe9e7dc, 0x2f3239],
  [/^asfalt_yan/, 0x55524d, 0x2f3239],
  [/^asfalt/, 0x2f3239, 0x1f2227],
  [/^kaldirim/, 0x9a9ca0, 0x7e8086],
  [/^neon_camgobegi/, 0x28e8ff, 0xe0ffff],
  [/^neon_pembe/, 0xff3ca8, 0xffd0ea],
  [/^neon_kehribar/, 0xffa91e, 0xffe6c0],
  [/^neon_limon/, 0xb8ff2c, 0xf0ffc0],
  [/^pencere_karanlik/, 0x141a24, 0x2a3a52],
  [/^pencere_sicak/, 0xffc566, 0xa8571f],
  [/^pencere_soguk/, 0x9edcff, 0x2a6592],
  [/^cephe_koyu/, 0x262a31, 0x1a1d22],
  [/^cephe_acik/, 0xb9c0c8, 0x8e959d],
  [/^holo_panel/, 0x6ca8ff, 0xd060e8],
  [/^kayar_kapi_acik/, 0x5dffa0, 0x22262d],
  [/^kayar_kapi/, 0x52f0ff, 0x213242],
  [/^tas$/, STONE, 0x6a6c70],
  [/^kiriktas/, 0x7a7c80, 0x5a5c60],
];

const SOUND_COLORS = {
  taş: STONE, toprak: 0x7a5230, kum: 0xe2d29a, ahşap: 0xa07040, cam: 0xbfe6f5,
  su: 0x3a8fd9, çim: 0x6fae45, metal: 0xb0b4b8, yaprak: 0x4f8f35, kar: 0xf2f6fa,
};

const COLOR_TILE = BLOCK_COLORS.map((c) => ({ key: foldTr(c.key), hex: c.hex }));
const RUNE_TILE = RUNES.map((r) => ({ key: foldTr(r.color), hex: r.hex }));

function shade(hex, f) {
  const r = Math.max(0, Math.min(255, Math.round(((hex >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((hex >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((hex & 255) * f)));
  return (r << 16) | (g << 8) | b;
}

/** Doku adı → [ana, ikinci] (ASCII'ye katlanmış kurallarla); bulunamazsa null. */
export function tileColors(tileName) {
  if (!tileName) return null;
  const f = foldTr(tileName);
  for (let i = 0; i < COLOR_TILE.length; i++) {
    const c = COLOR_TILE[i];
    if (f === 'cam_' + c.key) return [c.hex, shade(c.hex, 0.8)];
    if (f === 'beton_' + c.key) return [c.hex, shade(c.hex, 0.85)];
    if (f === 'kumas_' + c.key) return [c.hex, shade(c.hex, 0.78)];
  }
  for (let i = 0; i < RUNE_TILE.length; i++) {
    if (f === 'run_' + RUNE_TILE[i].key) return [RUNE_TILE[i].hex, shade(RUNE_TILE[i].hex, 0.7)];
  }
  if (f === 'cam') return [0xbfe6f5, 0xa0d0e8];
  for (let i = 0; i < RULES.length; i++) {
    if (RULES[i][0].test(f)) return [RULES[i][1], RULES[i][2]];
  }
  return null;
}

const cache = new Map();

/**
 * Blok kimliği → temsili ana renk (hex). Hava ve geçersiz kimlik gri döner.
 * Üst/yan dokulardan yan doku öncelikli (kırma parçacıkları yanlara bakar).
 */
export function blockBaseColor(id) {
  return blockDebrisColors(id)[0];
}

/** Blok kimliği → kırıntı renk paleti [ana, ikinci, açık ton, koyu ton] (hex). Önbellekli, dizi dondurulmuştur. */
export function blockDebrisColors(id) {
  let v = cache.get(id);
  if (v) return v;
  const b = getBlock(id);
  let c = null;
  if (b && b.tileNames) {
    c = tileColors(b.tileNames.side) || tileColors(b.tileNames.top);
    // çimenli toprak gibi: yan doku toprak, üstü yeşil — palete üst rengi de kat
    if (c && b.tileNames.top && b.tileNames.top !== b.tileNames.side) {
      const t = tileColors(b.tileNames.top);
      if (t && t[0] !== c[0]) c = [c[0], t[0]];
    }
  }
  if (!c) {
    const base = (b && SOUND_COLORS[b.sound]) || STONE;
    c = [base, shade(base, 0.8)];
  }
  const second = c[1] === null || c[1] === undefined ? shade(c[0], 0.8) : c[1];
  v = Object.freeze([c[0], second, shade(c[0], 1.22), shade(c[0], 0.62)]);
  cache.set(id, v);
  return v;
}

export const DEBRIS_FALLBACK = Object.freeze([STONE, DARK_STONE, shade(STONE, 1.2), shade(STONE, 0.6)]);

/** Parçacık/hayalet için serbest renk girişini [a,b,c,d] palete çevirir: blok kimliği | {color,color2} | hex sayı dizisi. */
export function paletteFrom(arg) {
  if (typeof arg === 'number') return blockDebrisColors(arg);
  if (Array.isArray(arg)) return arg.length >= 2 ? arg : [arg[0], shade(arg[0], 0.8), shade(arg[0], 1.2), shade(arg[0], 0.6)];
  if (arg && typeof arg === 'object') {
    if (arg.id !== undefined) return blockDebrisColors(arg.id);
    const c = arg.color === undefined ? STONE : arg.color;
    const c2 = arg.color2 === undefined ? shade(c, 0.8) : arg.color2;
    return [c, c2, shade(c, 1.2), shade(c, 0.6)];
  }
  if (typeof arg === 'string' && /^#?[0-9a-f]{6}$/i.test(arg)) {
    const c = parseInt(arg.replace('#', ''), 16);
    return [c, shade(c, 0.8), shade(c, 1.2), shade(c, 0.6)];
  }
  return DEBRIS_FALLBACK;
}
