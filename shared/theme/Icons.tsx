import type { ReactNode, SVGProps } from 'react';

// Thin-stroke icon set drawn for ZPLAYER (24 px grid, 1.5 px strokes). No third-party icon fonts.
function Svg({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const PlayIcon = () => <Svg><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" /></Svg>;
export const PauseIcon = () => <Svg><path d="M8 5.5v13M16 5.5v13" strokeWidth="2.6" /></Svg>;
export const PreviousIcon = () => <Svg><path d="M6.5 6v12" strokeWidth="2" /><path d="M18 6v12L9 12z" fill="currentColor" stroke="none" /></Svg>;
export const NextIcon = () => <Svg><path d="M17.5 6v12" strokeWidth="2" /><path d="M6 6v12l9-6z" fill="currentColor" stroke="none" /></Svg>;
export const ShuffleIcon = () => <Svg><path d="M3 7h3.5c4.5 0 6.5 10 11 10H21M3 17h3.5c1.6 0 2.8-1.2 3.8-2.8M13.7 9.8C14.7 8.2 15.9 7 17.5 7H21" /><path d="M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5" /></Svg>;
export const RepeatIcon = ({ one = false }: { one?: boolean }) => <Svg>
  <path d="M4 11V9.5A2.5 2.5 0 0 1 6.5 7H19M20 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5" />
  <path d="M16.5 4.5 19 7l-2.5 2.5M7.5 19.5 5 17l2.5-2.5" />
  {one && <path d="M11.2 10.6 12.4 9.8v4.6" strokeWidth="1.4" />}
</Svg>;
export const HeartIcon = ({ filled = false }: { filled?: boolean }) => <Svg>
  <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.6c0 5.2-7.5 9.6-7.5 9.6z" fill={filled ? 'currentColor' : 'none'} />
</Svg>;
export const VolumeIcon = () => <Svg><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></Svg>;
export const BackIcon = () => <Svg strokeWidth="2.4"><path d="M18.5 12H6M11.5 6.5 6 12l5.5 5.5" /></Svg>;
export const QueueIcon = () => <Svg><path d="M4 7h11M4 12h11M4 17h7M18 14v6M15 17h6" /></Svg>;
export const PlusIcon = () => <Svg><path d="M12 6v12M6 12h12" /></Svg>;
export const CheckIcon = () => <Svg><path d="M6 12.5l4 4 8-9" /></Svg>;
export const PinIcon = ({ filled = false }: { filled?: boolean }) => <Svg><path d="M9 4h6l-1 5 3 3H7l3-3zM12 12v8" fill={filled ? 'currentColor' : 'none'} /></Svg>;
export const SearchIcon = () => <Svg><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></Svg>;
export const FullscreenIcon = () => <Svg><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></Svg>;
