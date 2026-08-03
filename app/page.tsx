import BootSequence from "@/components/BootSequence";
import HeroName from "@/components/motion/HeroName";
import RasterReveal from "@/components/motion/RasterReveal";
import Terminal from "@/components/Terminal";
import Window from "@/components/Window";
import ImageFrame from "@/components/ImageFrame";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import { profile } from "@/content/profile";
import { skills } from "@/content/skills";

const highlights = [
  { k: "startup", v: "Co-Founder & CTO @ Presterly" },
  { k: "accelerator", v: "Hatch105" },
  { k: "academic", v: "1.1 / 4.0 GPA" },
];

export default function Home() {
  return (
    <BootSequence>
      <div className="stack">
        <Window title="~/whoami" className="hero">
          <div className="hero__grid">
            <div className="hero__text">
              <PromptLine command="whoami" />
              <h1 className="hero__name">
                <HeroName text={profile.name} />
              </h1>
              <p className="hero__tagline">{profile.tagline}</p>
              <p className="hero__loc">{profile.location}</p>
              <p className="hero__edu">{profile.education}</p>
            </div>
            <div className="hero__portrait">
              <ImageFrame
                src={profile.portrait || undefined}
                alt="Portrait of Fergus O'Reilly"
                label="portrait.jpg"
                plate="fergus-oreilly"
                ratio="1 / 1"
              />
            </div>
          </div>
        </Window>

        <Terminal />

        <RasterReveal as="ul" className="highlights" aria-label="Highlights">
          {highlights.map((h, i) => (
            <li key={h.k} className="hl" style={{ ["--hl-i" as string]: i }}>
              <span className="hl__k">{h.k}/</span>
              <span className="hl__v">{h.v}</span>
            </li>
          ))}
        </RasterReveal>

        <RasterReveal>
          <Window title="~/about" className="about">
            <span id="about" className="anchor" />
            <PromptLine command="cat about.txt" />
            {profile.bio.map((p, i) => (
              <p key={i} className="about__p">
                {p}
              </p>
            ))}
          </Window>
        </RasterReveal>

        <RasterReveal>
          <Window title="~/skills">
            <span id="skills" className="anchor" />
            <PromptLine command="ls ./skills" />
            <dl className="skills">
              {skills.map((g) => (
                <div key={g.label} className="skills__row">
                  <dt className="skills__label">
                    <Scramble text={`${g.label}/`} trigger="view" speed={18} />
                  </dt>
                  <dd className="skills__items">{g.items.join("  ·  ")}</dd>
                </div>
              ))}
            </dl>
          </Window>
        </RasterReveal>

        <RasterReveal>
          <Window title="~/contact">
            <span id="contact" className="anchor" />
            <PromptLine command="./contact.sh" />
            <ul className="contact">
              {profile.contact.map((c) => (
                <li key={c.label} className="contact__row">
                  <span className="contact__k">{c.label}</span>
                  <a href={c.href} target="_blank" rel="noreferrer">
                    {c.value}
                  </a>
                </li>
              ))}
            </ul>
          </Window>
        </RasterReveal>
      </div>
    </BootSequence>
  );
}
