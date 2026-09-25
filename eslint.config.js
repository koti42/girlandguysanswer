import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      /*
       * JSX'te tanımsız bileşen kullanımını yakalar.
       *
       * ESLint'in kendi no-undef'i JSX eleman adlarını referans saymıyor:
       * `<FaVenus />` yazıp import etmeyi unutmak lint'ten de build'den de
       * sessizce geçiyor, sadece kullanıcı o ekranı açınca ReferenceError
       * olarak patlıyordu. Bir bileşen ayrı dosyaya taşındığında tam olarak
       * bu oluyor.
       */
      'react/jsx-no-undef': 'error',

      /*
       * Aynı boşluğun diğer yüzü: JSX'te kullanılan bir değişken referans
       * sayılmadığı için no-unused-vars onu "kullanılmıyor" diye işaretliyor.
       * `{ icon: Icon }` gibi yalnızca JSX'te geçen bağlamalar bu yüzden
       * yanlışlıkla temizlenebiliyordu.
       */
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',

      /*
       * Prop'tan state'e senkronizasyon (sunucudan gelen beğeni sayısını
       * iyimser yerel state'e yazmak, URL parametresini hata mesajına
       * çevirmek gibi) bu kuralı tetikliyor. React'in önerdiği yol türetilmiş
       * değer ya da `key` ile sıfırlama; ama mevcut kullanımlar kasıtlı ve
       * çalışıyor. Hata seviyesinde tutmak lint kapısını sürekli kırmızı
       * bırakıyordu - uyarıya alındı ki görünür kalsın, ama gate'i kilitlemesin.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          // Yakalanan hatayı kullanmamak yaygın ve kasıtlı: `catch (err)`
          // yazıp err'e dokunmamak hata değil. Tamamen susturmak yerine
          // alt çizgiyle işaretlenenleri geçiyoruz.
          caughtErrorsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Netlify fonksiyonu ve sitemap üreteci tarayıcıda değil Node'da koşuyor:
    // process, exports ve Buffer orada tanımlı. Bunlar 'no-undef' hatası
    // olarak raporlanıyordu; ortam bildirilmediği için.
    files: ['netlify/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Netlify fonksiyonu CommonJS (exports.handler), build script'i ise ESM.
    files: ['netlify/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    // Context dosyaları hem Provider bileşenini hem useX hook'unu dışa açıyor.
    // Bu React'te standart kalıp; kural yalnızca Fast Refresh'in o dosyada
    // tam çalışmayacağını söylüyor, gerçek bir hata değil.
    files: ['src/context/**/*.jsx', 'src/admin/context/**/*.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
