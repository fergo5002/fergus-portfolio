import BootSequence from "@/components/BootSequence";
import Scramble from "@/components/Scramble";
import Terminal from "@/components/Terminal";
import Window from "@/components/Window";
import ImageFrame from "@/components/ImageFrame";
import PromptLine from "@/components/PromptLine";
import { profile } from "@/content/profile";
import { skills } from "@/content/skills";

const highlights = [
  { k: "internship", v: "Hatch105 × HappyStack" },
  { k: "startup", v: "CTO @ Larry" },
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
                <Scramble text={profile.name} />
              </h1>
              <p className="hero__tagline">{profile.tagline}</p>
              <p className="hero__loc">{profile.location}</p>
              <p className="hero__edu">{profile.education}</p>
            </div>
            <div className="hero__portrait">
              <ImageFrame alt="Portrait of Fergus O'Reilly" label="portrait.jpg" ratio="1 / 1" />
            </div>
          </div>
        </Window>

        <Terminal />

        <ul className="highlights" aria-label="Highlights">
          {highlights.map((h) => (
            <li key={h.k} className="hl">
              <span className="hl__k">{h.k}/</span>
              <span className="hl__v">{h.v}</span>
            </li>
          ))}
        </ul>

        <Window title="~/about" className="about">
          <span id="about" className="anchor" />
          <PromptLine command="cat about.txt" />
          {profile.bio.map((p, i) => (
            <p key={i} className="about__p">
              {p}
            </p>
          ))}
        </Window>

        <Window title="~/skills">
          <span id="skills" className="anchor" />
          <PromptLine command="ls ./skills" />
          <dl className="skills">
            {skills.map((g) => (
              <div key={g.label} className="skills__row">
                <dt className="skills__label">{g.label}/</dt>
                <dd className="skills__items">{g.items.join("  ·  ")}</dd>
              </div>
            ))}
          </dl>
        </Window>

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
      </div>
    </BootSequence>
  );
}
