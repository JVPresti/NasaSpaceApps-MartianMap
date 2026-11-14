// Small line icons for the helmet HUD, drawn in the current text colour.
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
const Svg = ({ children, label }) => (
  <svg viewBox="0 0 24 24" className="hud-icon" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>{children}</svg>
);

export const Stopwatch = () => <Svg><circle cx="12" cy="13" r="7.5" {...S} /><path d="M12 13V9M10 2.5h4M12 2.5v3" {...S} /></Svg>;
export const Horizon = () => <Svg><path d="M3 17h18M6 17a6 6 0 0 1 12 0M12 7V5M5.6 9.6 4.2 8.2M18.4 9.6l1.4-1.4" {...S} /></Svg>;
export const Battery = () => <Svg><rect x="2.5" y="7" width="17" height="10" rx="2" {...S} /><path d="M21.5 10.5v3M6 10v4M9.5 10v4M13 10v4" {...S} /></Svg>;
export const Gauge = () => <Svg><path d="M4 17a8 8 0 1 1 16 0" {...S} /><path d="M12 17l4-5M8 17h8" {...S} /></Svg>;
export const Return = () => <Svg><path d="M9 6 4 11l5 5" {...S} /><path d="M4 11h10a6 6 0 0 1 0 12h-2" {...S} /></Svg>;
export const Thermometer = () => <Svg><path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0Z" {...S} /><path d="M12 9v7" {...S} /></Svg>;
export const Wind = () => <Svg><path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8" {...S} /></Svg>;
export const Radiation = () => <Svg><circle cx="12" cy="12" r="1.6" {...S} /><path d="M12 10.4 9.2 5.6a7.5 7.5 0 0 1 5.6 0ZM13.4 12.8l2.8 4.8a7.5 7.5 0 0 0 2.8-4.9ZM10.6 12.8l-2.8 4.8A7.5 7.5 0 0 1 5 12.7Z" {...S} /></Svg>;
export const Pointer = () => <Svg><path d="M4 4l16 6.5-7 1.8L11.2 20Z" {...S} /></Svg>;
export const Alert = () => <Svg><path d="M12 3.5 2.5 20h19Z" {...S} /><path d="M12 10v4.5M12 17.3v.2" {...S} /></Svg>;
