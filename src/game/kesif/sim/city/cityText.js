/*
 * KEŞİF sim/city — küçük metin yardımcısı (saf). Üretim kodu (cityBrands: tabela büyük harf) yalnız bunu içe aktarır; yasak sözcük / gerçek ad
 * listesi (citySafeData.js, cityRealBrands.js) yalnız test ve tarama betiğindedir ve üretim paketine GİRMEZ.
 *  trUpper(str) -> Türkçe kurallı büyük harf (i→İ, ı→I); toLocaleUpperCase('tr')'ye bağlı değildir.
 */
const TR_UPPER = {
  i: 'İ', ı: 'I', ş: 'Ş', ğ: 'Ğ', ü: 'Ü', ö: 'Ö', ç: 'Ç', â: 'Â', î: 'Î', û: 'Û',
};

export function trUpper(str) {
  let out = '';
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    out += TR_UPPER[c] || c.toUpperCase();
  }
  return out;
}
