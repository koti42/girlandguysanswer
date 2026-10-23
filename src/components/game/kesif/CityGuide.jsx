import React from 'react';
import { CITY_GUIDE } from './kxCityGuide.js';
import './kxCityGuide.css';

/*
 * Neon Meridyen rehberi: bölümlere ayrılmış, klavyeyle gezilebilir açılır liste (yerel <details>; JS yok, ekran okuyucu "genişletilebilir" olarak okur).
 * İçerik tek kaynaktan: kxCityGuide.js (sayılar CITY_FACTS'ten, testlerle gerçek kurallara bağlı). Kullanım yerleri: Duraklat > Nasıl Oynanır >
 * Neon Meridyen sekmesi (PauseHowTo) ve lobideki "Neon Meridyen rehberi" kartı (HowTo).
 *
 * Props: openId (başlangıçta açık bölüm; varsayılan 'portal', null = hepsi kapalı), heading (başlık gösterilsin), headingId (aria için benzersiz kimlik öneki)
 */

const Keys = ({ keys }) => (
  <span className="kx-cg-kbds">
    {keys.map((k, i) => (k === '…' ? (
      <span key={'gap' + i} aria-hidden="true">…</span>
    ) : (
      <kbd key={k}>{k}</kbd>
    )))}
  </span>
);

const Lead = ({ b, text }) => (
  <>
    {b ? <b>{b}: </b> : null}
    {text}
  </>
);

const Block = ({ block, sid }) => {
  switch (block.t) {
    case 'p':
      return <p className="kx-cg-p">{block.text}</p>;
    case 'note':
      return <p className="kx-cg-note" role="note">{block.text}</p>;
    case 'ol':
      return (
        <ol className="kx-cg-ol" aria-label={sid + ' adımları'}>
          {block.items.map((it, i) => (
            <li key={i}><Lead b={it.b} text={it.text} /></li>
          ))}
        </ol>
      );
    case 'ul':
      return (
        <ul className="kx-cg-ul">
          {block.items.map((it, i) => (
            <li key={i}><Lead b={it.b} text={it.text} /></li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="kx-cg-tablewrap" role="region" aria-label={block.label} tabIndex={0}>
          <table className="kx-cg-table">
            <caption>{block.label}</caption>
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} scope="col">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'keys':
      return (
        <ul className="kx-cg-keys" aria-label={block.label}>
          {block.rows.map((r) => (
            <li key={r.what}>
              <span className="kx-cg-what">{r.what}</span>
              <Keys keys={r.keys} />
              {r.note ? <span className="kx-cg-knote">{r.note}</span> : null}
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
};

/** @param {{openId?: string|null, heading?: boolean, headingId?: string}} props */
const CityGuide = ({ openId = 'portal', heading = true, headingId = 'kx-cg-h' }) => (
  <section className="kx-cg" aria-labelledby={heading ? headingId : undefined} aria-label={heading ? undefined : 'Neon Meridyen rehberi'} data-testid="kx-city-guide">
    {heading ? <h3 id={headingId} className="kx-cg-h">Neon Meridyen rehberi</h3> : null}
    <p className="kx-cg-intro">Portal Tabancasını üretmekten hızlı seyahate kadar her şey. Bir başlığa dokunarak ya da Enter tuşuyla açabilirsin.</p>
    <div className="kx-cg-list">
      {CITY_GUIDE.map((s) => (
        <details key={s.id} className="kx-cg-sec" id={'kx-cg-' + s.id} data-section={s.id} open={openId === s.id}>
          <summary className="kx-cg-sum"><span>{s.title}</span></summary>
          <div className="kx-cg-body">
            <p className="kx-cg-lead">{s.lead}</p>
            {s.blocks.map((b, i) => (
              <Block key={i} block={b} sid={s.title} />
            ))}
          </div>
        </details>
      ))}
    </div>
  </section>
);

export default CityGuide;
