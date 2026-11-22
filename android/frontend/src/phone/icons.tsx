// Phone-only icons, drawn the same way as theme/Icons.tsx (24 px grid, 1.5 px round strokes).
const Svg = ({ children }: { children: React.ReactNode }) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none"
  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;

/** Where music plays (devices). */
export const DevicesIcon = () => <Svg><path d="M7 3.5h10v17H7z" /><path d="M11 17.5h2" /></Svg>;
