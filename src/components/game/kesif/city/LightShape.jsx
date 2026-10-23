import React, { memo } from 'react';
import { LIGHT_SHAPES } from './lightShapes.js';

/** Işık ipucu şekli (aria-hidden: aynı bilgi çipin metninde durur). */
const LightShape = ({ kind, className = 'kx-clight-shape' }) => {
  const s = LIGHT_SHAPES[kind] || LIGHT_SHAPES.terminal;
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true" focusable="false" data-shape={s.shape}>
      {s.points ? <polygon points={s.points} strokeLinejoin="round" /> : <circle cx="8" cy="8" r="6.8" />}
    </svg>
  );
};

export default memo(LightShape);
