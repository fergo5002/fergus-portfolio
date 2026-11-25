import { profile } from "@/content/profile";
import { socialCopy } from "@/content/contact";
import "./social.css";

type Network = keyof typeof socialCopy.names;

/**
 * The marks are the networks' own (Simple Icons, CC0), drawn in `currentColor`
 * so they wear the phosphor at rest and the brand's colours on hover.
 */
const ICONS: Record<Network, React.ReactNode> = {
  linkedin: (
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  ),
  github: (
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  ),
  email: (
    <path d="M2 4.5h20a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zm.8 2.1v11.1h18.4V6.6L12 13.2 2.8 6.6zm1.7-.3L12 11.6l7.5-5.3h-15z" />
  ),
};

/**
 * LinkedIn, GitHub and email, from `profile.contact`, so an address changes
 * in one place. Two sizes:
 *
 * - `buttons`, at the foot of the home page (Fergus, 2026-11-25: "custom
 *   linkedin & github buttons ... in the styling of the website, and if you
 *   hover over the buttons the actual colours of the brand comes up");
 * - `boxes`, the three smaller boxes under the coffee and call cards on
 *   `/contact`, with the handle under the name.
 *
 * The email box is a `mailto:` with the address printed in it, so a machine
 * with no mail app still shows the visitor everything they need.
 */
export default function SocialLinks({
  variant,
  networks,
}: {
  variant: "buttons" | "boxes";
  networks: Network[];
}) {
  const links = networks
    .map((network) => ({ network, link: profile.contact.find((c) => c.label === network) }))
    .filter((x): x is { network: Network; link: (typeof profile.contact)[number] } => Boolean(x.link));
  return (
    <ul className={`social social--${variant}`} aria-label={socialCopy.label}>
      {links.map(({ network, link }) => {
        const external = link.href.startsWith("https://");
        return (
          <li key={network}>
            <a
              className={`social__link social__link--${network}`}
              href={link.href}
              {...(external ? { target: "_blank", rel: "me noreferrer" } : {})}
            >
              <svg className="social__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                {ICONS[network]}
              </svg>
              <span className="social__text">
                <span className="social__name">{socialCopy.names[network]}</span>
                {variant === "boxes" && <span className="social__value">{link.value}</span>}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
