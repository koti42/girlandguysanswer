/*
 * Işık ipucu şekilleri (renk körlüğü için renge EK ayırt edici): her tür ayrı bir geometri. 16×16 görünüm kutusu.
 * Saf veri (hudStore.HUD_LIGHT_KINDS ile birebir aynı anahtarlar — test); çizim: LightShape.jsx.
 */
export const LIGHT_SHAPES = Object.freeze({
  terminal: Object.freeze({ shape: 'elmas', points: '8,1 15,8 8,15 1,8' }),
  kapi: Object.freeze({ shape: 'kare', points: '2,2 14,2 14,14 2,14' }),
  pano: Object.freeze({ shape: 'üçgen', points: '8,1.5 15,14 1,14' }),
  garaj: Object.freeze({ shape: 'daire', points: '' }),
  cip: Object.freeze({ shape: 'altıgen', points: '4.5,1.5 11.5,1.5 15,8 11.5,14.5 4.5,14.5 1,8' }),
  grafiti: Object.freeze({ shape: 'yıldız', points: '8,0.8 10,6 15.2,8 10,10 8,15.2 6,10 0.8,8 6,6' }),
  oda: Object.freeze({ shape: 'artı', points: '6,1 10,1 10,6 15,6 15,10 10,10 10,15 6,15 6,10 1,10 1,6 6,6' }),
});
