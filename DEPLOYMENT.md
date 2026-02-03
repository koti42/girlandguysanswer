# Cloudflare Pages Deployment Guide

Bu proje Cloudflare Pages'e deploy edilmek üzere hazırlanmıştır.

## Gereksinimler

- Node.js 20.x
- npm veya yarn

## Cloudflare Pages'de Deploy Etme

### 1. GitHub Repository'yi Bağlama

1. Cloudflare Dashboard'a giriş yapın
2. Pages sekmesine gidin
3. "Create a project" butonuna tıklayın
4. GitHub repository'nizi seçin

### 2. Build Ayarları

Cloudflare Pages'de aşağıdaki ayarları yapın:

- **Framework preset**: Vite
- **Build command**: `npm run build`
- **Build output directory**: `dist`
- **Root directory**: `/` (proje root'u)

### 3. Environment Variables

Eğer environment variables kullanıyorsanız, Cloudflare Pages dashboard'unda ekleyin:

- `VITE_API_URL` (veya diğer VITE_ prefix'li değişkenler)

### 4. Node.js Versiyonu

Proje `.nvmrc` dosyası ile Node.js 20 kullanacak şekilde ayarlanmıştır.

## Önemli Dosyalar

- `public/_redirects`: SPA routing için gerekli (React Router)
- `.nvmrc`: Node.js versiyonu belirtimi
- `vite.config.js`: Build ayarları

## Build Komutları

```bash
# Development
npm run dev

# Production Build
npm run build

# Preview
npm run preview
```

## Notlar

- `_redirects` dosyası `public/` klasöründe olmalı, böylece build sonrası `dist/` içine kopyalanır
- Tüm route'lar `index.html`'e yönlendirilir (SPA routing için)
- Environment variables `VITE_` prefix'i ile başlamalıdır
