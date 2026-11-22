import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { BackButton } from './Controls';
import { Backdrop } from './Player';
import './page.css';

/**
 * App frame: one album-art backdrop behind every page, an optional top menu, the page area, and the
 * mini player pinned below. With a `header`, pages hide their own corner back buttons (the menu has one).
 */
export function Shell({ background, header, footer, children }: { background?: string; header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return <div className={`shell${header ? ' has-menu' : ''}`}>
    <Backdrop src={background} variant="hub" />
    {header}
    <div className="shell-main">{children}</div>
    {footer}
  </div>;
}

const RouteVisible = createContext(true);

/**
 * Lets a page put its own image behind the whole shell (menu bar included) instead of only behind
 * the page. The app provides the setter and passes the image to `Shell` as `background`.
 */
export const PageBackground = createContext<((url: string | undefined) => void) | null>(null);

/** Sets the shell background while this page is the visible one. */
export function usePageBackground(url: string | undefined) {
  const set = useContext(PageBackground);
  const visible = useContext(RouteVisible);
  useEffect(() => {
    if (!set || !visible || !url) return;
    set(url);
    return () => set(undefined);
  }, [set, visible, url]);
  return !!set;
}

/** A page in the navigation stack. Hidden pages stay mounted so they keep pivot and scroll state. */
export function Route({ visible, children }: { visible: boolean; children: ReactNode }) {
  return <div className="route" hidden={!visible}><RouteVisible.Provider value={visible}>{children}</RouteVisible.Provider></div>;
}

/**
 * Detail page template (album, playlist): back button, big square art, kicker, large title,
 * subtitle, meta line and actions, then the content list. The whole page scrolls.
 */
export function DetailPage({ onBack, background, art, kicker, title, subtitle, meta, actions, children }: {
  onBack: () => void;
  background?: string;
  art: string;
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const shellHasIt = usePageBackground(background);
  return <div className="page">
    {!shellHasIt && <Backdrop src={background} variant="hub" />}
    <BackButton onClick={onBack} />
    <div className="page-scroll">
      <div className="page-bar clear-back" data-tauri-drag-region data-no-swipe><span className="t-meta">{kicker}</span></div>
      <header className="page-head">
        <img className="page-art" src={art} alt="" />
        <div className="page-copy">
          <h1 className="page-title">{title}</h1>
          {subtitle && <div className="page-sub">{subtitle}</div>}
          {meta && <span className="t-meta">{meta}</span>}
          {actions && <div className="actions page-actions">{actions}</div>}
        </div>
      </header>
      <div className="page-body">{children}</div>
    </div>
  </div>;
}
