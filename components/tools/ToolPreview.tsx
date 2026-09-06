/** Illustrative instrument diagrams, never presented as measured visitor data. */
export default function ToolPreview({ slug }: { slug: string }) {
  return <svg className={`bench-preview bench-preview--${slug}`} viewBox="0 0 400 150" aria-hidden="true" focusable="false" fill="none">
    <path className="bench-preview__grid" d="M0 30H400M0 60H400M0 90H400M0 120H400M50 0V150M100 0V150M150 0V150M200 0V150M250 0V150M300 0V150M350 0V150" />
    {slug === "atlas" ? <><path d="M200 75L100 35M200 75L310 40M200 75L290 120M200 75L85 115M100 35L40 65M310 40L360 85M85 115L40 65" />{[[200,75,12],[100,35,7],[310,40,9],[290,120,6],[85,115,9],[40,65,5],[360,85,6]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill="var(--bg-panel)" />)}</>
      : slug === "group-lore" ? <>{Array.from({length:42},(_,i)=><rect key={i} x={44+(i%14)*23} y={30+Math.floor(i/14)*33} width="15" height="23" fill={i%3===0 ? "currentColor" : "none"} />)}</>
      : slug === "pocket-redact" ? <><path d="M105 15H295V135H105ZM128 38H245M128 62H270M128 87H258M128 112H240" /><path d="M126 62H216M170 87H270" strokeWidth="15" /></>
      : slug === "prove-it" ? <><path d="M60 38H140M60 60H120M60 105H140M190 30V120M150 50H190M150 105H190M190 75H245M305 75H350" /><circle cx="275" cy="75" r="29" /><path d="M263 75L272 84L289 65" /></>
      : slug === "resonance" ? <>{[0,1,2,3].map(v=><g key={v}>{Array.from({length:16},(_,i)=><rect key={i} x={25+i*22} y={24+v*29} width="13" height="17" fill={(i+v*3)%(v+3)===0 ? "currentColor" : "none"} />)}</g>)}</>
      : slug === "relief" ? Array.from({ length: 9 }, (_, i) => <path key={i} d={`M-10 ${130-i*8} C50 ${140-i*4} 65 ${25-i*3} 125 ${65-i*5} S200 ${155-i*12} 240 ${70-i*5} S320 ${15+i*5} 410 ${35+i*9}`} />)
      : slug === "overlap" ? <><circle cx="163" cy="75" r="54" /><circle cx="237" cy="75" r="54" /><path d="M195 43V107M205 43V107" /><circle cx="144" cy="60" r="3" /><circle cx="248" cy="85" r="3" /><circle cx="200" cy="75" r="4" /></>
      : slug === "second-visit" ? <><path d="M30 20V125H375" /><path d="M30 125H55V105H85V85H125V65H175V49H245V38H330V31H375" /><path className="bench-preview__secondary" d="M30 125H55V115H85V102H125V94H175V87H245V82H330V77H375" /></>
      : slug === "drift" ? <>{[38,78,52,96,61,42,81,55].map((v,i) => <g key={i}><path d={`M${40+i*43} 125V${125-v}`} strokeWidth="8" /><path className="bench-preview__secondary" d={`M${52+i*43} 125V${125-v*(i%2 ? .6 : 1.2)}`} strokeWidth="5" /></g>)}</>
      : <>{[0,1,2].map(i => <g key={i}><path d={`M35 ${45+i*30}H${150-i*22}`} strokeWidth="9" strokeDasharray={i === 1 ? "6 8" : undefined} /><path d={`M240 ${45+i*30}H${370-i*22}`} strokeWidth="9" /></g>)}<path d="M185 75H215M207 67L215 75L207 83" /></>}
  </svg>;
}
