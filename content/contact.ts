/**
 * Every word on `/contact`, per the house rule that copy lives in `content/`
 * and never in a component.
 *
 * Since 2026-11-25 the page is two cards (a coffee, a call, both booked
 * straight into Fergus's calendar) and three smaller boxes under them:
 * LinkedIn, GitHub and email. The message form is gone; the meeting form
 * still sends through the same Resend path when a time cannot be booked, and
 * keeps the same honeypot.
 */
export const contactCopy = {
  command: "./say-hello",
  path: "~/contact",
  title: "get in touch",
  honeypotLabel: "Leave this field empty",
} as const;

/** The LinkedIn, GitHub and email links on the home page and `/contact`. */
export const socialCopy = {
  label: "Find me elsewhere",
  names: {
    linkedin: "LinkedIn",
    github: "GitHub",
    email: "Email",
  },
} as const;
