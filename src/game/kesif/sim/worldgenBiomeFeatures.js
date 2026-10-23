/*
 * KEŞİF sim — biyom yüzey özellikleri (saf, belirlenimci): lav havuzları.
 * worldgen.surfaceFor ve worldgenFlora.treeInCell kullanır (döngüsüz: yalnız gürültü nesnesi alır).
 */

/** Yanardağ lav havuzu gürültü eşiği: bu değerin üstü havuz. */
export const LAVA_POOL_THR = 0.58;

/** Gürültü nesnesi N (g.c) ile (x,z) volkanik biyomda lav havuzu sütunu mu? margin: kenar payı (blok; büyük = havuza yakınlar da sayılır). */
export function lavaPoolN(N, x, z, margin = 0) {
  return N.simplex2(x * 0.031 + 777, z * 0.031 - 123) > LAVA_POOL_THR - margin * 0.05;
}

/** g (üretici durumu) ile aynı sorgu. */
export function lavaPoolAt(g, x, z, margin = 0) {
  return lavaPoolN(g.c, x, z, margin);
}
