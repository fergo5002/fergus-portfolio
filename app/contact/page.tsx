import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import PromptLine from "@/components/PromptLine";
import Scramble from "@/components/Scramble";
import ContactForm from "@/components/ContactForm";
import { contactCopy } from "@/content/contact";
import { profile } from "@/content/profile";
import { OG_IMAGE, breadcrumbSchema, canonical, contactPageSchema } from "@/lib/seo";

const DESCRIPTION = `Get in touch with ${profile.shortName}, ${profile.jobTitle.toLowerCase()} in ${profile.location}. Send a message from the page, or email him directly.`;

export const metadata: Metadata = {
  // Bare, because the root layout's title template appends the name.
  title: "Contact",
  description: DESCRIPTION,
  alternates: canonical("/contact"),
  openGraph: {
    title: `Contact · ${profile.shortName}`,
    description: DESCRIPTION,
    type: "website",
    url: "/contact",
    images: [OG_IMAGE],
  },
  twitter: { card: "summary_large_image", images: [OG_IMAGE] },
};

/**
 * `/contact`.
 *
 * **Why there is a page here at all.** The call to action at the bottom of every
 * other page used to be a `mailto:` link labelled "Email me". On a machine with
 * no mail client registered, which is most of them now, clicking it does
 * nothing whatsoever: no error, no new tab, no feedback. Fergus reported it as
 * a dead button. A page cannot fail that way.
 *
 * The direct address is printed underneath the form on purpose, and it is not a
 * hedge. A visitor who does not want to type into a stranger's form should not
 * have to, and if the send ever fails, the address they need is already on
 * screen rather than behind another click.
 */
export default function ContactPage() {
  return (
    <div className="stack">
      <JsonLd
        nodes={[
          contactPageSchema(),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Contact", path: "/contact" },
          ]),
        ]}
      />
      <PromptLine command={contactCopy.command} path={contactCopy.path} />
      <h1 className="page__title">
        <Scramble text={contactCopy.title} speed={34} />
      </h1>
      <p className="page__lede">{contactCopy.lede}</p>

      <ContactForm />

      <section className="cdirect" aria-labelledby="contact-direct">
        <h2 id="contact-direct" className="cdirect__title">
          {contactCopy.directLabel}
        </h2>
        <ul className="contact">
          {profile.contact.map((c) => (
            <li key={c.label} className="contact__row">
              <span className="contact__k">{c.label}</span>
              <a
                href={c.href}
                {...(c.href.startsWith("http")
                  ? { target: "_blank", rel: "me noreferrer" }
                  : {})}
              >
                {c.value}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
