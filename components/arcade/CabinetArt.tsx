import type { GameId } from "@/lib/arcade/engine";

/** Original vector marquees, built from the same shapes as their playable worlds. */
export default function CabinetArt({ game }: { game: GameId }) {
  return <svg className="cabinet-art" viewBox="0 0 600 340" fill="none" aria-hidden="true">
    <path d="M0 0H600V340H0Z" fill="#07110d" />
    <g stroke="currentColor" opacity=".1">
      {Array.from({ length: 16 }, (_, i) => <path key={`v${i}`} d={`M${i * 40} 0V340`} />)}
      {Array.from({ length: 10 }, (_, i) => <path key={`h${i}`} d={`M0 ${i * 40}H600`} />)}
    </g>
    {game === "bounce" && <>
      <g transform="translate(85 32) skewY(-12)" stroke="currentColor">
        {Array.from({ length: 35 }, (_, i) => { const x = i % 7, y = Math.floor(i / 7); return <g key={i} opacity={x + y > 7 ? .16 : 1}><path d={`M${x * 57} ${y * 31}h49v23h-49z`} fill="currentColor" fillOpacity={y === 0 ? .3 : .05} /><path d={`M${x * 57 + 4} ${y * 31 + 5}h41`} opacity=".35" /></g>; })}
      </g>
      <path d="M430 35L335 204L415 280L269 307" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" opacity=".4" />
      <path d="M335 204L415 280" stroke="#ffc478" strokeWidth="3" />
      <circle cx="415" cy="280" r="9" fill="#ffc478" /><circle cx="415" cy="280" r="19" stroke="#ffc478" opacity=".3" />
      <path d="M205 307h123" stroke="currentColor" strokeWidth="8" />
      <path d="M312 200l-22 3m20-16-17-12m31-2-3-23m22 24 15-19m1 35 26-3" stroke="#ffc478" strokeWidth="2" />
    </>}
    {game === "pong" && <>
      <g transform="translate(305 170) rotate(-25)" stroke="currentColor">
        {[40, 65, 92, 125, 162, 205].map((r, i) => <ellipse key={r} rx={r} ry={r * .45} opacity={1 - i * .14} />)}
      </g>
      <circle cx="305" cy="170" r="30" fill="#07110d" stroke="#ffc478" strokeWidth="2" />
      <path d="M80 72Q312 35 330 169T516 242" stroke="#ffc478" strokeWidth="2" />
      <path d="M80 90v91M520 180v91" stroke="currentColor" strokeWidth="7" />
      <circle cx="423" cy="246" r="7" fill="#ffc478" /><path d="M419 245l-30-1" stroke="#ffc478" strokeWidth="3" opacity=".5" />
      <path d="M295 170h20m-10-10v20" stroke="#ffc478" opacity=".5" />
    </>}
    {game === "snake" && <>
      <path d="M75 278V74h136v172h100V111h119v137h100" stroke="currentColor" strokeWidth="24" opacity=".13" />
      <path d="M75 278V74h136v172h100V111h119v137h100" stroke="currentColor" strokeWidth="20" strokeDasharray="17 7" />
      <path d="M75 278V74h136v172" stroke="currentColor" strokeWidth="12" strokeDasharray="7 17" opacity=".5" />
      <path d="M516 237h25v23h-25z" fill="currentColor" /><path d="M532 241v4m0 7v4" stroke="#06100c" strokeWidth="3" />
      <g stroke="#ffc478" transform="translate(268 61) rotate(45)"><rect x="-12" y="-12" width="24" height="24" /><rect x="-5" y="-5" width="10" height="10" fill="#ffc478" /></g>
      <circle cx="268" cy="61" r="29" stroke="#ffc478" opacity=".25" />
    </>}
    {game === "under" && <>
      <g transform="translate(300 178) scale(1 .52) rotate(45)" stroke="currentColor">
        {[0, 1, 2].map(i => <g key={i} transform={`translate(${i * 24} ${i * 24})`} opacity={1 - i * .3}><rect x="-146" y="-146" width="292" height="292" fill="#07110d" /><path d="M-146-74H-45v74H62v74h84M-74-146v72M62-146V-74h84M-74 0v146M0 74v72M62 0v-74" strokeWidth="14" /><path d="M-119-119h30v30h-30zM91 91h30v30H91z" fill="currentColor" fillOpacity=".2" /></g>)}
      </g>
      <path d="M298 73v122" stroke="#ffc478" strokeDasharray="3 6" />
      <circle cx="298" cy="196" r="14" stroke="#ffc478" /><path d="M291 196h14m-7-7v14" stroke="#ffc478" />
      <path d="M290 33h16l-8 13z" fill="#ffc478" />
      <path d="M164 262v38m0-18h33m239-203V44m0 19h-33" stroke="currentColor" opacity=".45" />
    </>}
    {game === "signal" && <>
      {[50, 100, 155].map((r, i) => <circle key={r} cx="300" cy="170" r={r} stroke="currentColor" opacity={.4 - i * .1} strokeDasharray={i === 1 ? "4 9" : undefined} />)}
      <path d="M300 150l19 20-19 20-19-20z" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity=".15" />
      <circle cx="300" cy="170" r="4" fill="currentColor" />
      {Array.from({ length: 16 }, (_, i) => { const a = i * 2.399, r = 100 + i % 4 * 40, x = 300 + Math.cos(a) * r * 1.25, y = 170 + Math.sin(a) * r * .75; return <g key={i} transform={`translate(${x} ${y}) rotate(${i * 32})`} stroke="#ffc478" opacity={.45 + i % 3 * .2}><path d="M0-11l11 19h-22z" /><path d="M0-11v-18" opacity=".3" /></g>; })}
      <path d="M313 157l64-58m-89 83-40 48m39-73-50-26" stroke="currentColor" strokeWidth="2" strokeDasharray="12 8" />
    </>}
    {game === "poker" && <>
      {[-2, -1, 0, 1, 2].map((i) => <g key={i} transform={`translate(${300 + i * 59} ${170 + Math.abs(i) * 12}) rotate(${i * 14})`}>
        <rect x="-51" y="-83" width="102" height="166" fill="#0b1c12" stroke={i === 0 ? "#ffc478" : "currentColor"} strokeWidth="2" />
        <path d="M-40-71h18m-18 6h18M23 65h18m-18 6h18" stroke="currentColor" opacity=".5" />
        <path d={i % 2 ? "M0-22l19 22L0 22-19 0z" : "M0-23C-8-9-24-6-19 6c4 9 15 5 19 0 4 5 15 9 19 0C24-6 8-9 0-23zM0 4v19m-9 0H9"} stroke={i === 0 ? "#ffc478" : "currentColor"} fill={i === 0 ? "#ffc478" : "currentColor"} fillOpacity=".18" strokeWidth="2" />
      </g>)}
      <path d="M94 300h412M180 310h240" stroke="currentColor" opacity=".2" />
    </>}
    <g stroke="currentColor" opacity=".45"><path d="M14 35V14h21M565 14h21v21M14 305v21h21M565 326h21v-21" /></g>
  </svg>;
}
