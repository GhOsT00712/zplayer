import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BackButton } from './Controls';
import { Backdrop } from './Player';
import './hub.css';

export interface PivotItem {
  id: string;
  label: string;
  render: () => ReactNode;
}

type Direction = 'next' | 'prev';

/**
 * A Metro-style hub: huge lowercase title that bleeds off the edge, a looping strip of
 * pivot headers, and one content pane. Switch pivots with header clicks, arrow keys,
 * Ctrl+Tab, horizontal wheel / trackpad swipe, or click-and-drag.
 */
export function Hub({ title, items, initial = 0, brand, actions, background, footer, inputEnabled = true, onBack, subheader }: {
  title: string;
  items: PivotItem[];
  initial?: number;
  brand?: ReactNode;
  /** Small controls at the top right (for example the theme switch). */
  actions?: ReactNode;
  /** Image that fills the hub background (the playing song's album art). */
  background?: string;
  /** Pinned to the bottom (the mini player). */
  footer?: ReactNode;
  /** False while another view (now playing) covers the hub. */
  inputEnabled?: boolean;
  /** Shows the circled back button at the top left (detail hubs such as an artist). */
  onBack?: () => void;
  /** Rendered between the title and the pivot headers (for example the search box). */
  subheader?: ReactNode;
}) {
  const [active, setActive] = useState(initial);
  const [direction, setDirection] = useState<Direction>('next');
  const [seq, setSeq] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const count = items.length;

  const goTo = useCallback((index: number, dir: Direction) => {
    setActive(index);
    setDirection(dir);
    setSeq(s => s + 1);
  }, []);
  const step = useCallback((delta: 1 | -1) => {
    setActive(current => {
      const next = (current + delta + count) % count;
      setDirection(delta > 0 ? 'next' : 'prev');
      setSeq(s => s + 1);
      return next;
    });
  }, [count]);

  usePivotInput(rootRef, step, inputEnabled);

  const item = items[active];
  if (!item) return null;
  const titleStyle = { '--title-x': `calc(${-active} * var(--title-step))` } as CSSProperties;

  return <div className="hub" ref={rootRef}>
    <Backdrop src={background} variant="hub" />
    {onBack && <BackButton onClick={onBack} />}
    <header className="hub-head">
      <div className={`hub-bar${onBack ? ' clear-back' : ''}`} data-tauri-drag-region data-no-swipe>
        <span className="hub-lead">
          {brand && <span className="hub-brand t-meta">{brand}</span>}
        </span>
        {actions}
      </div>
      <h1 className="hub-title" style={titleStyle}>{title}</h1>
      {subheader && <div className="hub-sub">{subheader}</div>}
    </header>
    <PivotStrip items={items} active={active} direction={direction} seq={seq}
      onSelect={index => index !== active && goTo(index, 'next')} />
    <div className="pivot-viewport">
      <section key={`${item.id}-${seq}`} className={`pivot-pane enter-${direction}`}
        role="tabpanel" id={`pane-${item.id}`} aria-labelledby={`tab-${item.id}`}>
        {item.render()}
      </section>
    </div>
    {footer}
  </div>;
}

/** Headers loop: the active one is always first, the rest follow in order. */
export function PivotStrip({ items, active, direction, seq, onSelect }: {
  items: PivotItem[];
  active: number;
  direction: Direction;
  seq: number;
  onSelect: (index: number) => void;
}) {
  const ordered = items.map((_, i) => (active + i) % items.length);
  return <div key={seq} className={`pivot-strip enter-${direction}`} role="tablist">
    {ordered.map(index => {
      const pivot = items[index]!;
      const selected = index === active;
      return <button key={pivot.id} id={`tab-${pivot.id}`} role="tab" className="pivot-header"
        aria-selected={selected} aria-controls={`pane-${pivot.id}`} tabIndex={selected ? 0 : -1}
        onClick={() => onSelect(index)}>{pivot.label}</button>;
    })}
  </div>;
}

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
}

/** Keyboard, wheel and drag input for a hub. Drag offset is written to CSS vars, not React state. */
function usePivotInput(rootRef: React.RefObject<HTMLDivElement | null>, step: (delta: 1 | -1) => void, enabled: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditable(event.target)) return;
      if (event.key === 'Tab' && event.ctrlKey) {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
        return;
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
    };

    // Horizontal wheel / trackpad: one switch per gesture. A gesture ends after 250 ms of quiet.
    let wheelSum = 0;
    let quietUntil = 0;
    const onWheel = (event: WheelEvent) => {
      const dx = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (!dx) return;
      event.preventDefault();
      const now = performance.now();
      if (now < quietUntil) { quietUntil = now + 250; return; }
      wheelSum += dx;
      if (Math.abs(wheelSum) > 60) {
        step(wheelSum > 0 ? 1 : -1);
        wheelSum = 0;
        quietUntil = now + 250;
      }
    };

    // Click-and-drag / touch swipe.
    let start: { x: number; y: number; id: number } | null = null;
    let dragging = false;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let suppressClick = false;
    const setDrag = (dx: number) => {
      root.style.setProperty('--drag', `${dx}px`);
      root.style.setProperty('--drag-fade', String(1 - Math.min(Math.abs(dx) / root.clientWidth, 1) * .6));
    };
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0 || isEditable(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[data-no-swipe]')) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      dragging = false;
      lastX = event.clientX;
      lastT = event.timeStamp;
      velocity = 0;
    };
    const onMove = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!dragging) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        dragging = true;
        root.setPointerCapture(event.pointerId);
        root.classList.add('is-dragging');
        window.getSelection()?.removeAllRanges();
      }
      const dt = event.timeStamp - lastT;
      if (dt > 0) velocity = (event.clientX - lastX) / dt;
      lastX = event.clientX;
      lastT = event.timeStamp;
      setDrag(dx);
    };
    const onUp = (event: PointerEvent) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      start = null;
      if (!dragging) return;
      dragging = false;
      root.classList.remove('is-dragging');
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      setDrag(0);
      const threshold = Math.min(140, root.clientWidth * .18);
      if (event.type === 'pointerup' && (Math.abs(dx) > threshold || Math.abs(velocity) > .6)) step(dx < 0 ? 1 : -1);
    };
    const onClick = (event: MouseEvent) => {
      if (suppressClick) { event.preventDefault(); event.stopPropagation(); }
    };

    window.addEventListener('keydown', onKey);
    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);
    root.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('click', onClick, true);
    };
  }, [rootRef, step, enabled]);
}
