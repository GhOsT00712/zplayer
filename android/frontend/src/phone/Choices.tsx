import type { CSSProperties } from 'react';
import { accents, type Accent } from '@zplayer/theme';

/** Lowercase words as a choice (Zune style): the chosen one white, the rest grey. */
export function Choices<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (value: T) => void;
}) {
  return <div className="choices" role="group" aria-label={label} data-no-swipe>
    {options.map(([id, text]) => <button key={id} type="button" className="choice" aria-pressed={value === id}
      onClick={() => onChange(id)}>{text}</button>)}
  </div>;
}

/** The 8 accents as squares in one row. */
export function Swatches({ value, onChange }: { value: Accent; onChange: (accent: Accent) => void }) {
  return <div className="swatches" role="group" aria-label="Accent colour" data-no-swipe>
    {accents.map(([name, colour]) => <button key={name} type="button" className="swatch" aria-label={name} title={name}
      aria-pressed={value === name} style={{ '--swatch': colour } as CSSProperties} onClick={() => onChange(name)} />)}
  </div>;
}
