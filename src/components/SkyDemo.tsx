import { useEffect, useState } from 'react';

const sample = 'Oye, mañana a las 10:30 revisamos el diseño y luego lo publicamos.';

/** A looping demonstration over Bruma's sky: press fn, the pill wakes up, words appear in the app. */
export default function SkyDemo({ showKey = true, showWindow = true, app = 'Mensajes', reducedMotion = false }: { showKey?: boolean; showWindow?: boolean; app?: string; reducedMotion?: boolean }) {
  const words = sample.split(' ');
  const [tick, setTick] = useState(reducedMotion ? words.length + 6 : 0);
  useEffect(() => {
    if (reducedMotion) return;
    const timer = setInterval(() => setTick(value => (value + 1) % (words.length + 12)), 260);
    return () => clearInterval(timer);
  }, [reducedMotion, words.length]);
  // 0-3 resting, 4.. key down & words appear, then key up and the text stays for a moment.
  const speaking = tick >= 3 && tick < words.length + 5;
  const shown = Math.max(0, Math.min(words.length, tick - 4));
  return <div className="sky-card is-drifting" aria-hidden="true">
    <div className="demo-stage">
      {showWindow && <div className="demo-window">
        <div className="demo-window-head"><i /><i /><i /><span>{app}</span></div>
        <span className="demo-text">{words.slice(0, shown).map((word, i) => <span key={`${i}-${tick < 4 ? 'reset' : 'run'}`}>{word} </span>)}</span><span className="demo-caret" />
      </div>}
      {showKey && <span className="demo-key" data-down={speaking || undefined}>fn</span>}
      <span className="demo-pill" data-on={speaking || undefined}>{Array.from({ length: 11 }, (_, i) => <i key={i} />)}</span>
    </div>
  </div>;
}
