# SEO: Edge ön-render (Cloudflare Pages Functions)

## Sorun

Site saf istemci tarafı React SPA. Sunucudan giden HTML 3 KB'lık boş bir kabuktu: `<div id="root"></div>`,
sabit başlık, tek bir açıklama. Sonuçları:

- Googlebot içeriği yalnızca JS render kuyruğunda görüyordu (ikinci dalga indeksleme, günler sürer, bütçe yer).
- Mesajlaşma ve sosyal ağ botları JS çalıştırmaz: paylaşılan her bağlantı başlıksız/önizlemesiz gidiyordu.
- Var olmayan soru adresleri SPA fallback ile 200 dönüyordu ("soft 404").

## Çözüm

`functions/` altındaki Cloudflare Pages Functions, içerik sayfalarında kabuğu API verisiyle doldurur:

| Yol | Fonksiyon | API |
|---|---|---|
| `/question/:slug` | `functions/question/[slug].js` | `GET /api/questions/:slug` |
| `/questions/:slug` (kategori) | `functions/questions/[slug].js` | `GET /api/categories/:slug` |
| `/opinion/:slugOrId` | `functions/opinion/[slugOrId].js` | `GET /api/opinions/:x` |
| `/story/:slugOrId` | `functions/story/[slugOrId].js` | `GET /api/stories/:x` |
| `/sitemap.xml` | `functions/sitemap.xml.js` | `GET /api/sitemap.xml` (yedek: `public/sitemap.xml`) |

Fonksiyon dosyaları yalnızca yönlendirir; mantık `src/seo/edge/` altında saf modüllerdir ve vitest ile test edilir:

- `html.js` kaçışlama, etiket temizleme, `<head>` üretimi, kabuğa enjeksiyon
- `pages.js` API yanıtı → sayfa modeli (başlık, açıklama, canonical, robots, OG, JSON-LD, gövde HTML)
- `render.js` akış: edge önbellek → kabuk (`env.ASSETS`, kök yol) → API → enjeksiyon → önbellek
- `sitemap.js` canlı sitemap proxy'si

### Davranış kuralları

- **Fail-open.** API hata verirse, zaman aşımına düşerse (4 sn) ya da JSON bozuksa kabuk olduğu gibi döner.
  Bu katman siteyi asla kapatamaz.
- **Herkese aynı HTML.** Bot ayrımı yok (farklı içerik göstermek "cloaking" sayılır). React yüklenince
  `createRoot().render()` kök içeriğini temizler ve devralır; sunucudan gelen içerik ilk boyama ve botlar içindir.
- **API 404 → HTTP 404 + `noindex`.** Soft 404 biter. SPA yine yüklenir ve kendi "bulunamadı" ekranını çizer
  (giriş yapmış sahibi gizli içeriğini token ile yine görür).
- **Cevapsız soru → `noindex, follow`.** İnce içerik indekse girmez; bağlantılar takip edilir. Aynı kural
  React tarafında (`QuestionDetailPage` → `SEO robots`) ve backend sitemap'inde (cevapsız soru yazılmaz) geçerlidir.
- **Yetişkin hikâye → `noindex, follow` + `<meta name="rating" content="adult">`.** Sitemap'te de yok.
- **Önbellek.** Başarılı yanıt edge'de 5 dk (`s-maxage=300`), sitemap 1 saat. Anahtar sorgu dizisiz yol.
- **Profil bağlantısı basılmaz.** `/profile/*` giriş ister ve robots.txt'te kapalı; yalnızca ad yazılır.

### Ortam değişkenleri (Cloudflare Pages → Settings → Environment variables)

| Değişken | Varsayılan | Not |
|---|---|---|
| `SEO_API_URL` | `https://herkeslersoruyor.panalix.com.tr/api` | Edge'in çağırdığı API |
| `CANONICAL_ORIGIN` | `https://herkeslersoruyor.com.tr` | canonical / OG / JSON-LD URL kökü |

Preview dağıtımlarında canonical yine üretim alan adını gösterir; bu istenen davranıştır.

## Doğrulama

```bash
curl -s https://herkeslersoruyor.com.tr/question/<slug> | grep -c 'og:title'      # 1 olmalı
curl -sI https://herkeslersoruyor.com.tr/question/<slug> | grep -i x-seo-render    # question
curl -sI https://herkeslersoruyor.com.tr/question/olmayan-slug | head -1           # 404
curl -sI https://herkeslersoruyor.com.tr/sitemap.xml | grep -i x-sitemap-source    # api
```

Arama motoru: Search Console → URL Denetimi → "Taranan sayfayı görüntüle" içinde içerik HTML'de görünmeli.
Sosyal: sosyal ağların bağlantı hata ayıklama (paylaşım önizleme) araçlarıyla OG etiketleri denetlenir.

## Yapılmayanlar / sonraki adımlar

- Ana sayfa, `/questions` listesi ve `/opinions`/`/stories` listeleri hâlâ kabuk döner (dinamik, sık değişen;
  istenirse aynı desenle eklenir).
- Arama motoru Search Console doğrulaması index.html'de yok (yalnızca Yandex etiketi var). DNS ile doğrulanmadıysa
  site doğrulama meta etiketi eklenmeli.

## Ek katman (2. tur, 2026-10-29)

| Yol | Fonksiyon | Ne yapar |
|---|---|---|
| `/` | `functions/index.js` | Ana sayfa: 50-60 karakter başlık, H1, değer önerisi, son 12 soru bağlantısı, kategoriler, Organization + WebSite (SearchAction) şeması; 2 dk edge önbelleği |
| diğer her yol | `functions/[[path]].js` | Catch-all: bilinen SPA rotası → kabuk 200; bilinmeyen yol → kabuk + noindex, HTTP 404; .html olmayan uzantıya SPA fallback HTML geliyorsa → 404 düz metin (eski /assets parçası, uydurma .xml) |
| tüm fonksiyon yanıtları | `functions/_middleware.js` | Güvenlik başlıkları (HSTS, nosniff, X-Frame-Options, Referrer-Policy, CSP frame-ancestors); statik dosyalar için aynı liste `public/_headers` |

- `public/_routes.json`: statik dosyalar (`/assets/*`, görseller, robots, `/embed`) fonksiyona hiç uğramaz; günlük fonksiyon kotası yalnızca HTML sayfa isteklerine harcanır.
- `src/seo/edge/catchAll.js` içindeki `ROUTE_PATTERNS` App.jsx rotalarının kopyasıdır; `catchAll.test.js` App.jsx'i ayrıştırıp iki listeyi eşler. **Yeni rota eklendiğinde listeye de eklenmeli**, yoksa o sayfa 404 durumuyla (ama çalışır hâlde) döner.
- Varsayılan paylaşım görseli `public/og-default.jpg` (1200x630, ~40 KB); üretici betik tek seferlikti (Pillow), logo değişirse yeniden üretilmeli. React tarafı (`SEO.jsx`) ve edge aynı dosyayı kullanır.
- Soru meta açıklaması: cevap varsa "{başlık} sorusuna {n} cevap: {ilk cevap}" (160 karakter), yoksa soru metni.
