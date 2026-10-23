/*
 * KEŞİF sim/city — kaynak dosyası güvenlik tarayıcısı (safety_audit; sözleşme §2, §22.4–22.5). SAF: dosya/DOM erişimi yok;
 * dosya gezme ve okuma çağırana aittir (citySafe.test.js ve scripts/kesif-safety-scan.mjs).
 *  lexJs(src)           JS/JSX kaynağından dizge sabitleri + yorumlar (satır numarasıyla)
 *  jsxTexts(src)        JSX metin düğümleri
 *  scanSource(rel,text,mode,sopts?)  mode 'full': dizge+yorum+JSX; 'brand': yalnız §2 oyun/marka adları; sopts → scanText seçenekleri (ör. {fuzzy:true}).
 *                       -> [{file,line,term,via,where}]
 * Gerekçeli satır istisnası: ALLOW_MARKER + gerekçe (≥ 8 kr); en çok 3 kullanım, citySafe.test.js sınırlar.
 */
import { scanText } from './citySafeData.js';

export const ALLOW_MARKER = 'citysafe' + '-allow:';

/** Kaynak koddan dizge sabitleri ve yorumlar (satır numarasıyla) çıkarır; regex/şablon/iç içe ifade güvenli. */
export function lexJs(src) {
  const strings = [];
  const comments = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let lastSig = '';
  let lastWord = '';
  const isId = (c) => /[A-Za-z0-9_$]/.test(c);
  const skipBalanced = (start) => {
    let depth = 1;
    let j = start;
    while (j < n && depth > 0) {
      const c = src.charAt(j);
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' || c === '\'') {
        j++;
        while (j < n && src.charAt(j) !== c && src.charAt(j) !== '\n') j += src.charAt(j) === '\\' ? 2 : 1;
      } else if (c === '`') {
        j++;
        while (j < n && src.charAt(j) !== '`') j += src.charAt(j) === '\\' ? 2 : 1;
      }
      if (c === '\n') line++;
      j++;
    }
    return j;
  };
  while (i < n) {
    const ch = src.charAt(i);
    const nx = src.charAt(i + 1);
    if (ch === '\n') { line++; i++; continue; }
    if (ch === '/' && nx === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      comments.push({ text: src.slice(i + 2, j), line });
      i = j;
      continue;
    }
    if (ch === '/' && nx === '*') {
      let j = src.indexOf('*/', i + 2);
      if (j < 0) j = n;
      const body = src.slice(i + 2, j);
      comments.push({ text: body, line });
      line += body.split('\n').length - 1;
      i = j + 2;
      continue;
    }
    if (ch === '"' || ch === '\'') {
      let j = i + 1;
      let s = '';
      while (j < n && src.charAt(j) !== ch && src.charAt(j) !== '\n') {
        if (src.charAt(j) === '\\') { s += src.charAt(j + 1); j += 2; } else { s += src.charAt(j); j++; }
      }
      strings.push({ text: s, line });
      i = j + 1;
      lastSig = '"';
      lastWord = '';
      continue;
    }
    if (ch === '`') {
      let j = i + 1;
      let s = '';
      const startLine = line;
      while (j < n && src.charAt(j) !== '`') {
        const c = src.charAt(j);
        if (c === '\\') { s += src.charAt(j + 1); j += 2; continue; }
        if (c === '$' && src.charAt(j + 1) === '{') {
          strings.push({ text: s, line: startLine });
          s = ' ';
          j = skipBalanced(j + 2);
          continue;
        }
        if (c === '\n') line++;
        s += c;
        j++;
      }
      strings.push({ text: s, line: startLine });
      i = j + 1;
      lastSig = '"';
      lastWord = '';
      continue;
    }
    if (ch === '/') {
      const regexOk = lastSig === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(lastSig) || lastWord === 'return' || lastWord === 'typeof';
      if (regexOk) {
        let j = i + 1;
        let inClass = false;
        while (j < n && src.charAt(j) !== '\n') {
          const c = src.charAt(j);
          if (c === '\\') { j += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) break;
          j++;
        }
        i = j + 1;
        while (i < n && /[a-z]/.test(src.charAt(i))) i++;
        lastSig = ')';
        lastWord = '';
        continue;
      }
    }
    if (!/\s/.test(ch)) {
      lastSig = ch;
      if (isId(ch)) {
        let j = i;
        while (j < n && isId(src.charAt(j))) j++;
        lastWord = src.slice(i, j);
        lastSig = 'a';
        i = j;
        continue;
      }
      lastWord = '';
    }
    i++;
  }
  return { strings, comments };
}

/** JSX metin düğümleri (>Türkçe metin<) */
export function jsxTexts(src) {
  const out = [];
  const re = /(^|[^=])>([^<>{}]*[\p{L}][^<>{}]*)</gu;
  let m = re.exec(src);
  while (m) {
    out.push({ text: m[2], line: src.slice(0, m.index).split('\n').length });
    m = re.exec(src);
  }
  return out;
}

export const BRAND_CATS = new Set(['marka', 'oyun_marka']);

/** Bir dosyayı tarar; isabetleri `{file,line,term,via,where}` olarak döndürür. */
export function scanSource(rel, text, mode, sopts) {
  const so = sopts || {};
  const found = [];
  const isTest = /\.test\.(js|jsx)$/.test(rel);
  const lines = text.split('\n');
  const allowed = (ln) => {
    const l = lines[ln - 1] || '';
    const k = l.indexOf(ALLOW_MARKER);
    return k >= 0 && l.slice(k + ALLOW_MARKER.length).trim().length >= 8;
  };
  const add = (hits, line, where, keep) => {
    hits.forEach((h) => {
      if (keep && !keep(h)) return;
      if (allowed(line)) return;
      found.push({ file: rel, line, term: h.term, via: h.via, where });
    });
  };
  if (/\.(js|jsx|mjs|cjs|ts|tsx)$/.test(rel)) {
    const { strings, comments } = lexJs(text);
    strings.forEach((s) => {
      if (mode === 'full' && !isTest) add(scanText(s.text, so), s.line, 'string');
      else add(scanText(s.text, so), s.line, 'string', (h) => h.cat === 'oyun_marka');
    });
    comments.forEach((c) => {
      add(scanText(c.text, Object.assign({ loose: true }, so, { fuzzy: false })), c.line, 'comment', (h) => BRAND_CATS.has(h.cat) && (mode === 'full' || h.cat === 'oyun_marka'));
    });
    if (/\.(jsx|tsx)$/.test(rel)) {
      jsxTexts(text).forEach((s) => {
        if (mode === 'full' && !isTest) add(scanText(s.text, so), s.line, 'jsx');
      });
    }
  } else {
    text.split('\n').forEach((l, idx) => {
      add(scanText(l, Object.assign({ loose: true }, so, { fuzzy: false })), idx + 1, 'text', (h) => BRAND_CATS.has(h.cat) && (mode === 'full' || h.cat === 'oyun_marka'));
    });
  }
  return found;
}
