/*
 * KEŞİF bulmaca KİTİ — bulmaca yazarları için ortak araç takımı (saf; DOM/three yok, worker-güvenli).
 *
 * Her şey buradan (ya da puzzles/index.js'ten, aynı yüzey) alınır:
 *
 * ── Geometri (kitGeometry.js) ─────────────────────────────────────────────────────────────────────
 *   Yerel çerçeve: lx sağ, ly yukarı (zemin hücresi 0, zemin bloğu −1), lz derinlik (kapı duvarı −2,−1; oda içi 0..d−1).
 *   origin = kapının hemen arkasındaki zemin hücresi (ortada). facing 0..3 → yerel +lz dünyada +Z, −X, −Z, +X.
 *   frame(ctx) → F: toWorld/toLocal/dir/worldBox · set/get · fill/carve/hollow/paint · line/ring/disc ·
 *                   doorway · plate/lever · hash/chance (konum-hash'i: belirlenimli dekor).
 *   localToWorld, worldToLocal, localDir, worldDirToLocal, localXRange, localBoxToWorld, roomBounds, FACINGS,
 *   PUZZLE_BLOCKS (plaka, kol, rün taşları, ayna, alıcı… sistem blok kimlikleri).
 *
 * ── Oda kabuğu (kitChamber.js, kitThemes.js) ──────────────────────────────────────────────────────
 *   buildChamber(ctx,{w,d,h,theme?,doorFront?,doorBack?,lights?,trim?}) → {inner(yerel), innerWorld, outerWorld,
 *     doorFront:{x,y,z,cells,…}, doorBack|null, lights, theme, floorY}.  Bölge temalı (Z0 taş tuğla … Z4 obsidyen/rün),
 *     fener/meşaleli, parlayan rün süslü, kapı çerçeveli, güvenli zeminli; ön kapı HER ZAMAN açık (çıkış garantisi).
 *   doorEffects(door, open) / setDoorOpen(ctx, door, open): arka kapıyı (kilitli kapı bloğu) açıp kapama.
 *   chainOrigin(origin,facing,d), chamberChainOffset(d), CHAMBER_WALL (=2), chamberSize(w,d,h): zincirleme odalar.
 *   THEMES, themeForZone(zone), resolveTheme(t, zone).
 *
 * ── Bağlam ve rng (kitCtx.js) ─────────────────────────────────────────────────────────────────────
 *   puzzleSeed(worldSeed,id), puzzleRng(worldSeed,id), subRng(ctx,'etiket') (ana akıştan bağımsız, belirlenimli),
 *   makeCtx(o), buildPuzzleRoom(desc,{seed,setBlock,getBlock?,clip?}) → {state,anchors,…} (worldgen/decorate),
 *   chunkWriter(chunk) → {setBlock,getBlock,clip}.
 *
 * ── Efektler (kitEffects.js) ──────────────────────────────────────────────────────────────────────
 *   fx.setBlock/setBlocks/sound/particles/message/solved/spawn/giveItem/reset kurucuları;
 *   applyEffects(target, effects, meta?) → {applied,skipped,solved,reset,events}.
 *   {kind:'reset'}: yanlış hamlede otomatik sıfırlama (çözülmüş bulmaca sıfırlanmaz).
 *
 * ── Yönetici (kitManager.js) ──────────────────────────────────────────────────────────────────────
 *   new PuzzleManager({world, emit, seed, spawnEntity, radius=48, strict?, onError?})
 *   register(id,desc) · has · get · list · unregister · handleInteract(ev) · step(x,y,z) · update(dt, playerPos) ·
 *   nearest · ownerAt · reset(id,{force}) · resetNearest · hintFor · hintNear · serialize() · restore(map) ·
 *   on('solved'|'effect'|'message', cb) · errors/skipped.
 *
 * ── Test düzeneği (kitTestkit.js) ─────────────────────────────────────────────────────────────────
 *   FakeWorld, fakeCtx(o), fakeManager(o), simulate(mgr, saniye, playerPos, dt?).
 *   checkPuzzleConformance(tip,{difficulties?,facings?}) → sorun listesi: her puzzle testinde expect(...).toEqual([]) çağır
 *   (belirlenim, chunk-kesiti, kapı/çıkış, restore idempotent, olay fuzz'ı, serialize turu, reset tam geri alma).
 *
 * ══ BULMACA YAZARI SÖZLEŞMESİ ══════════════════════════════════════════════════════════════════════
 *  1. registerPuzzle('tip', {name, summary, difficultyRange, footprint, build, restore, interact, tick?, isSolved, hint?}).
 *  2. footprint(d) → {w,d,h,margin?}: oda İÇ hacmi; buildChamber ile aynı chamberSize sıkıştırmasını kullan.
 *  3. build(ctx): BELİRLENİMLİ ve yalnızca ctx.setBlock'a (frame/buildChamber üzerinden) yazar. Her chunk odayı yeniden
 *     kurup kendi kesitini alır → clip'e göre dallanma yok, dekor için hash (rng değil), getBlock'a bağlılık yok,
 *     varlık doğurma yok (kuru çalıştırmada yok sayılır). Döner {state, anchors}: state JSON-serileştirilebilir
 *     BAŞLANGIÇ durumu; anchors = istediğin yapıda DÜNYA koordinatlı {x,y,z} nesneleri (kol, plaka, ayna…): manager bu
 *     hücreleri konum dizinine koyar, olay önce bu tam eşleşmeyle bulmacaya gider.
 *  4. restore(ctx, state): dünyadaki DİNAMİK blokları (kol/plaka/kapı/ayna/platform…) state'e göre kurar (idempotent).
 *     Hem kayıttan yüklemede hem sıfırlamada çağrılır; reset = restore(başlangıç state'i) olduğundan TÜM dinamik
 *     blokları (build'in koyduğu başlangıç görünümüne) geri getirmelidir.
 *  5. interact(ctx, state, ev) → {state, effects, handled?}. ev: {type:'use'|'step'|'blockPlaced'|'blockBroken'|'entity'|
 *     'beam'|'portalShot', x,y,z, item?, entityId?, playerId?}. 'step': oyun, biri plakanın üstündeyken HER KARE yollar;
 *     bırakmayı ctx.time/state zamanlayıcısıyla (örn. 0,3 sn step gelmedi → kalktı) tick'te sen çöz.
 *     effects yerine ctx.setBlock ile doğrudan yazmak da serbest; efekt tercih edilir (test edilebilir).
 *  6. tick(ctx, state, dt): oyuncu ≤ 48 blok yakınken çağrılır (uzakta durur → zamanlayıcılar donar). Her karede
 *     çağrıldığı için ucuz tut, kare başına nesne üretme.
 *  7. isSolved(state) → bool. Çözülünce manager 'puzzleSolved' yayar (bir kez); çözülmüş durum kalıcıdır.
 *  8. OYUNCU ASLA TAKILI KALMAZ: ön kapı hep açık; yanlış hamlede {kind:'reset'} efekti + Türkçe {kind:'message'};
 *     çözülemez duruma düşülemiyorsa bile oyuncu sıfırlama (api.resetNearestPuzzle) kullanabilir.
 *  9. Erişilebilirlik: renk bilgisine ek olarak şekil/simge (RUNES.symbol), ipuçları hint(state) ile Türkçe;
 *     önemli olaylar 'message' efektiyle (oyun onSpeak ile sesli okur).
 * 10. Tüm kullanıcıya görünen metin Türkçe; sim'de Math.random/Date.now YOK; es2020.
 */
export * from './kitGeometry.js';
export * from './kitThemes.js';
export * from './kitChamber.js';
export * from './kitCtx.js';
export * from './kitEffects.js';
export * from './kitManager.js';
export * from './kitTestkit.js';
export * from './kitConformance.js';
