import Link from "next/link";
import Image from "next/image";
import TiltCard from "./motion/TiltCard";
import { homeCopy } from "@/content/home";

export default function WorkPreview({ name }: { name: keyof typeof homeCopy.previews }) {
  const work = homeCopy.previews[name];
  return <div className="work-preview">
    <Link href={work.href} className="work-preview__link">
      {work.label}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12" /></svg>
      <span className="work-preview__peek" aria-hidden="true">
        {work.image ? <Image src={work.image} alt="" width={320} height={180} /> : <span className="work-preview__hatch">Hatch<span>105</span><span className="work-preview__weeks">{Array.from({length: 10}, (_, i) => <i key={i} />)}</span></span>}
      </span>
    </Link>
    <div className="work-preview__panel">
      <TiltCard max={5}>
        <Link href={work.href} className="work-preview__card" tabIndex={-1}>
          {work.image ? <Image src={work.image} alt={work.alt} width={320} height={180} /> : <span className="work-preview__hatch">Hatch<span>105</span><span className="work-preview__weeks">{Array.from({length: 10}, (_, i) => <i key={i} />)}</span></span>}
          <span className="work-preview__caption"><strong>{work.title}</strong><span>{work.detail}</span></span>
        </Link>
      </TiltCard>
    </div>
  </div>;
}
