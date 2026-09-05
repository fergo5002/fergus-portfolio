/** Illustrative instrument diagrams, never presented as measured visitor data. */
export default function ToolPreview({ slug }: { slug: string }) {
  return <svg className={`bench-preview bench-preview--${slug}`} viewBox="0 0 400 150" aria-hidden="true" focusable="false" fill="none">
    <path className="bench-preview__grid" d="M0 30H400M0 60H400M0 90H400M0 120H400M50 0V150M100 0V150M150 0V150M200 0V150M250 0V150M300 0V150M350 0V150" />
    {slug === "relief" ? Array.from({ length: 9 }, (_, i) => <path key={i} d={`M-10 ${130-i*8} C50 ${140-i*4} 65 ${25-i*3} 125 ${65-i*5} S200 ${155-i*12} 240 ${70-i*5} S320 ${15+i*5} 410 ${35+i*9}`} />)
      : slug === "overlap" ? <><circle cx="163" cy="75" r="54" /><circle cx="237" cy="75" r="54" /><path d="M195 43V107M205 43V107" /><circle cx="144" cy="60" r="3" /><circle cx="248" cy="85" r="3" /><circle cx="200" cy="75" r="4" /></>
      : slug === "second-visit" ? <><path d="M30 20V125H375" /><path d="M30 125H55V105H85V85H125V65H175V49H245V38H330V31H375" /><path className="bench-preview__secondary" d="M30 125H55V115H85V102H125V94H175V87H245V82H330V77H375" /></>
      : slug === "drift" ? <>{[38,78,52,96,61,42,81,55].map((v,i) => <g key={i}><path d={`M${40+i*43} 125V${125-v}`} strokeWidth="8" /><path className="bench-preview__secondary" d={`M${52+i*43} 125V${125-v*(i%2 ? .6 : 1.2)}`} strokeWidth="5" /></g>)}</>
      : <>{[0,1,2].map(i => <g key={i}><path d={`M35 ${45+i*30}H${150-i*22}`} strokeWidth="9" strokeDasharray={i === 1 ? "6 8" : undefined} /><path d={`M240 ${45+i*30}H${370-i*22}`} strokeWidth="9" /></g>)}<path d="M185 75H215M207 67L215 75L207 83" /></>}
  </svg>;
}
