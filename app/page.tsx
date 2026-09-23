import Link from "next/link";
import BootSequence from "@/components/BootSequence";
import HeroName from "@/components/motion/HeroName";
import RasterReveal from "@/components/motion/RasterReveal";
import Window from "@/components/Window";
import ImageFrame from "@/components/ImageFrame";
import PromptLine from "@/components/PromptLine";
import WorkPreview from "@/components/WorkPreview";
import { profile } from "@/content/profile";
import { homeCopy } from "@/content/home";
import JsonLd from "@/components/JsonLd";
import Talk from "@/components/Talk";
import { profilePageSchema } from "@/lib/seo";
import "./home.css";

export default function Home() {
  return <BootSequence><div className="stack">
    <JsonLd nodes={[profilePageSchema()]} />
    <Window title="~/whoami" className="hero">
      <div className="hero__grid">
        <div className="hero__text">
          <PromptLine command="whoami" />
          <h1 className="hero__name"><HeroName text={profile.name} /></h1>
          <p className="hero__tagline">{profile.tagline}</p>
          <p className="hero__loc">{profile.location}</p>
          <p className="hero__edu">{profile.education}</p>
        </div>
        <div className="hero__portrait"><ImageFrame src={profile.portrait || undefined} alt="Portrait of Fergus O'Reilly" label="portrait.jpg" plate="fergus-oreilly" ratio="4 / 5" /></div>
      </div>
    </Window>
    <ul className="highlights home-highlights" aria-label="Highlights">
      <li className="hl"><span className="hl__k">{homeCopy.startup}</span><WorkPreview name="tigh" /></li>
      <li className="hl"><span className="hl__k">{homeCopy.previously}</span><WorkPreview name="presterly" /><WorkPreview name="hatch" /></li>
      <li className="hl"><span className="hl__k">{homeCopy.academic}</span><span className="hl__v">{homeCopy.academicValue}</span></li>
    </ul>
    <RasterReveal><Window title="~/about" className="about">
      <span id="about" className="anchor" />
      <PromptLine command="cat about.txt" />
      {profile.bio.map((p, i) => <p key={i} className="about__p">{p}</p>)}
      <div className="about__routes"><p>{homeCopy.aboutLinks}</p><div><Link href="/projects">{homeCopy.projects}</Link><Link href="/experience">{homeCopy.experience}</Link></div></div>
    </Window></RasterReveal>
    <RasterReveal><Talk /></RasterReveal>
  </div></BootSequence>;
}
