# interior/kinds

Her iç mekân türü bu klasörde tek dosyadır: `kinds/<tür>.js` (örn. `kinds/ramen_bari.js`).
Dosya `export default impl` ya da `export const interior = impl` verir; `index.js` `import.meta.glob('./kinds/*.js')` ile otomatik yükler
(`*.test.js` yüklenmez). `impl = {kind, name, footprint(variant) -> {w,d,h}, plan(lot, rng, variant, ctx) -> Interior, emit(W, interior, ctx)}`.
Tür modülleri `../index.js` dosyasını İÇE AKTARMAZ; `../registry.js`, `../frame.js`, `../kit.js`, `../kitPlan.js`, `../builder.js`, `../graph.js` yeterlidir.
