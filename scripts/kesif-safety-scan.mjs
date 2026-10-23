#!/usr/bin/env node
/*
 * KEŞİF / Neon Meridyen — aile güvenliği + marka tarama betiği (safety_audit; sözleşme §2, §22.4–22.5).
 *
 * Üç depoda (web, API, mobil) kullanıcıya görünen/sevk edilen metni `scanText` (citySafeData.js) ile tarar.
 * Dizge/JSX/yorum ayrıştırması citySafeScan.js'ten gelir; yeni bağımlılık yok.
 *
 *   node scripts/kesif-safety-scan.mjs                 # üç depo, varsayılan yollar
 *   node scripts/kesif-safety-scan.mjs --json          # makine okur çıktı
 *   node scripts/kesif-safety-scan.mjs --api <yol> --mobile <yol> --web <yol>
 *   node scripts/kesif-safety-scan.mjs --dist <klasör> # üretim paketi (vite build çıktısı): marka + hata ayıklama sızıntısı
 *
 * Kipler:  full  = dizge + JSX + yorumda yasak sözcük VE marka;   brand = yalnız gerçek marka/oyun adı (mevcut ana diyar içeriği
 * robot/büyü/kılıç gibi oyun sözcükleri taşıyabilir; şehir içeriği full).
 * Çıkış kodu: isabet varsa 1, yoksa 0.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource } from '../src/game/kesif/sim/city/citySafeScan.js';
import { scanText } from '../src/game/kesif/sim/city/citySafeData.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const WEB = resolve(arg('web', join(HERE, '..')));
const API = resolve(arg('api', join(WEB, '..', 'girlsandguys-api-v10')));
const MOBILE = resolve(arg('mobile', join(WEB, '..', 'girlandguysanswerMobile')));
const DIST = arg('dist', '');
const AS_JSON = argv.indexOf('--json') >= 0;
/* bulanık marka taraması (Minekraft, Starbuks…) varsayılan açık; --no-fuzzy ile kapatılır */
const SOPTS = { fuzzy: argv.indexOf('--no-fuzzy') < 0 };

const SCAN_EXT = /\.(js|jsx|mjs|cjs|css|md|json|html|php|ts|tsx|txt|svg|webmanifest)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.git', '__snapshots__', 'vendor', 'storage', 'out_city', 'coverage', '.expo']);
/* Veri dosyalarının kendisi (yasak liste) izinli; yeni bir izinli dosya EKLEMEYİN. */
const ALLOW = new Set([
  'src/game/kesif/sim/city/citySafeData.js', 'src/game/kesif/sim/city/cityRealBrands.js', 'src/game/kesif/sim/city/citySafe.test.js',
  'src/game/kesif/sim/city/citySafeDeep.test.js',
  /* API: kullanıcı haritası adı/açıklaması için KÜFÜR/iletişim bilgisi süzgeci (yasak sözcük VERİSİ; ancak süzgeç verisi) */
  'app/Services/Game/Kesif/KesifTextFilter.php',
]);

/** [kök, göreli yol, kip, dosya süzgeci?] */
const PLAN = [
  [WEB, 'src/game/kesif/sim/city', 'full'], [WEB, 'src/game/kesif/render/city', 'full'], [WEB, 'src/game/kesif/render/props', 'full'],
  [WEB, 'src/game/kesif/sim/dim', 'full'], [WEB, 'src/game/kesif/sim/props', 'full'],
  [WEB, 'src/components/game/kesif/city', 'full'],
  [WEB, 'src/game/kesif', 'brand'], [WEB, 'src/components/game/kesif', 'brand'], [WEB, 'src/pages/game', 'brand'],
  [WEB, 'src/embed', 'brand'], [WEB, 'src/services', 'brand', /kesif/i], [WEB, 'src/admin/pages/game', 'brand'],
  [WEB, 'docs', 'full'], [WEB, 'public', 'brand'], [WEB, 'index.html', 'brand'],
  [API, 'config/game_kesif.php', 'full'], [API, 'docs/GAME_API.md', 'mdsections'], [API, 'app/Services/Game/Kesif', 'full'],
  [API, 'app/Http/Controllers/Game/KesifController.php', 'full'], [API, 'app/Http/Controllers/Admin/AdminGameKesifController.php', 'full'],
  [API, 'app/Http/Middleware/KesifPayloadGuard.php', 'full'], [API, 'app/Http/Requests/Game', 'full', /Kesif/],
  [API, 'app/Models/Game', 'brand', /Kesif/], [API, 'database/migrations', 'brand', /kesif/i], [API, 'tests/Feature/Game', 'brand', /Kesif/],
  [MOBILE, 'src/game', 'full', /kesif|bridge|photo/i], [MOBILE, 'src/screens/game', 'brand', /Kesif|WebView/],
  [MOBILE, 'src/components/game/GameWebView.js', 'full'], [MOBILE, 'src/components/game/gameTheme.js', 'brand'],
  [MOBILE, 'src/components/vitrin/GamesTeaser.js', 'brand'], [MOBILE, 'app.json', 'brand'],
];

function collect(abs, filter, out) {
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) { out.push(abs); return; }
  readdirSync(abs).forEach((name) => {
    if (SKIP_DIR.has(name)) return;
    const p = join(abs, name);
    const s = statSync(p);
    if (s.isDirectory()) collect(p, filter, out);
    else if (SCAN_EXT.test(name) && (!filter || filter.test(name))) out.push(p);
  });
}

/** Büyük API belgesi: yalnız Keşif/Neon/şehir başlıklı bölümler tam kipte, kalanı yalnız §2 oyun adları. */
function scanMarkdownSections(rel, text) {
  const lines = text.split('\n');
  const out = [];
  let inKesif = false;
  let inFence = false;
  lines.forEach((l, i) => {
    if (/^```/.test(l)) inFence = !inFence;
    const m = !inFence && /^(#{1,6})\s+(.*)$/.exec(l);
    if (m) inKesif = /neon|şehir|sehir|city|meridyen|boyut/i.test(m[2]) || (inKesif && m[1].length > 2);
    const hs = scanText(l, { loose: true });
    hs.forEach((h) => {
      if (h.cat === 'oyun_marka' || (inKesif && (h.cat === 'marka' || !/(marka|oyun_marka)/.test(h.cat)))) {
        out.push({ file: rel, line: i + 1, term: h.term, via: h.via, where: inKesif ? 'md-kesif' : 'md' });
      }
    });
  });
  return out;
}

function scanFile(abs, rootLabel, root, mode) {
  const rel = rootLabel + ':' + relative(root, abs).split(sep).join('/');
  if (ALLOW.has(relative(root, abs).split(sep).join('/'))) return [];
  let text;
  try { text = readFileSync(abs, 'utf8'); } catch { return []; }
  if (mode === 'mdsections') return scanMarkdownSections(rel, text);
  if (/\.php$/.test(abs)) {
    /* PHP: dizge sabitleri JS sözdizimine yakın (tek/çift tırnak); yorum/dizge ayrımı için aynı çıkarıcı yeterli */
    return scanSource(rel.replace(/\.php$/, '.js'), text, mode, SOPTS).map((h) => ({ ...h, file: rel }));
  }
  return scanSource(rel, text, mode, SOPTS);
}

/* Gerekçeli, dar istisnalar (dosya + terim). Yeni istisna eklemeden önce metni değiştirin; SAFETY_REPORT.md her birini listeler. */
const APPROVED = [
  { file: 'mobile:src/components/game/GameWebView.js', term: 'öldür', why: 'WebView "render süreci sistem tarafından öldürüldü" tanı dizgesi (ASCII "oldurulde"); mevcut jest testi bu sözcüğü bekler; kullanıcıya gösterilmez' },
];
/* Mağaza/platform adları YALNIZ geliştirici yorumunda (mobil/API) teknik bağlam olarak serbest; kullanıcı metninde yasak. */
const PLATFORM_IN_COMMENTS = new Set(['Google', 'Apple', 'Android', 'Chrome', 'Safari', 'Microsoft', 'Windows', 'Linux']);
const isApproved = (h) => (h.where === 'comment' && h.file.indexOf('web:') !== 0 && PLATFORM_IN_COMMENTS.has(h.term)) ||
   APPROVED.some((a) => a.file === h.file && a.term === h.term);

const seenFile = new Map();
const hits = [];
let filesScanned = 0;
PLAN.forEach(([root, relPath, mode, filter]) => {
  const label = root === WEB ? 'web' : root === API ? 'api' : 'mobile';
  const files = [];
  collect(join(root, relPath), filter, files);
  files.forEach((abs) => {
    const prev = seenFile.get(abs);
    if (prev === 'full' || prev === mode) return;
    seenFile.set(abs, mode);
    filesScanned++;
    scanFile(abs, label, root, mode).forEach((h) => { if (!isApproved(h)) hits.push(h); });
  });
});

/*
 * Üretim paketi (vite build çıktısı; --dist <klasör>): (1) Keşif / Neon Meridyen parçalarının (içinde "Neon Meridyen" geçen .js/.css/.html) dizgeleri tam kipte taranır
 * (küçültülmüş tanımlayıcılar değil, yalnız dizge sabitleri); (2) hata ayıklama sızıntısı: window.__game / __dbg / __G atamaları, api._debug (buildDebug), api.command
 * adlı genel erişim YOK olmalıdır. (Kapalı komut yürütücüsü dizgesi "Hata ayıklama komutları bu derlemede kapalı" bilerek pakette kalır: komutlar üretimde reddedilir.)
 */
const distLeaks = [];
if (DIST && existsSync(DIST)) {
  const files = [];
  collect(resolve(DIST), null, files);
  files.forEach((abs) => {
    if (!/\.(js|css|html|json)$/.test(abs)) return;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { return; }
    const rel = relative(DIST, abs).split(sep).join('/');
    filesScanned++;
    if (text.indexOf('Neon Meridyen') >= 0 && /\.js$/.test(abs)) {
      scanSource('dist:' + rel, text, 'full', SOPTS).forEach((h) => { if (!/^(gun|ghost|portal)/i.test(h.term)) hits.push(h); });
    }
    [
      [/window\.__(game|dbg|G)\b/, 'window.__game/__dbg/__G'], [/globalThis\.__(game|dbg|G)\b/, 'globalThis.__game'],
      [/\._debug\s*=\s*\(\)\s*=>/, 'api._debug ataması'], [/\bbuildDebug\b/, 'buildDebug'], [/\bapi\.command\b/, 'api.command'],
    ].forEach(([re, needle]) => {
      const m = re.exec(text);
      if (m) distLeaks.push({ file: rel, needle, ctx: text.slice(Math.max(0, m.index - 40), m.index + 80).replace(/\s+/g, ' ') });
    });
  });
}

if (AS_JSON) {
  process.stdout.write(JSON.stringify({ filesScanned, hits, distLeaks }, null, 2) + '\n');
} else {
  process.stdout.write('KEŞİF güvenlik taraması: ' + filesScanned + ' dosya, ' + hits.length + ' isabet, ' + distLeaks.length + ' paket sızıntısı\n');
  hits.slice(0, 400).forEach((h) => process.stdout.write('  ' + h.file + ':' + h.line + ' [' + h.where + '] ' + h.term + ' (' + h.via + ')\n'));
  distLeaks.forEach((l) => process.stdout.write('  SIZINTI ' + l.file + ' "' + l.needle + '" ... ' + l.ctx + '\n'));
}
process.exit(hits.length || distLeaks.length ? 1 : 0);
