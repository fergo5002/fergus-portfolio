export type ContactFieldCopy = {
  /** The wire name. Must match what `lib/contact-server.ts` reads. */
  name: "name" | "email" | "message";
  label: string;
  placeholder: string;
  /** Passed straight through to the input, so a browser can fill it properly. */
  autoComplete: string;
  multiline?: boolean;
  inputType?: "text" | "email";
};

/**
 * Every word on `/contact`, per the house rule that copy lives in `content/`
 * and never in a component.
 *
 * The tone is the same as the call to action it replaced: an invitation with no
 * agenda attached. The failure copy is the part worth reading twice. It says
 * plainly whose fault it is, states that nothing typed has been lost, and
 * offers the mail-app link and the copy button as equals, because the whole
 * reason this page exists is that a `mailto:` link silently does nothing on
 * most machines.
 */
export const contactCopy = {
  command: "./say-hello",
  path: "~/contact",
  title: "contact",
  lede: "Anything you send here lands in my inbox and I answer it myself. Building something, hiring, or backing early companies: all welcome, no agenda needed.",

  fields: [
    {
      name: "name",
      label: "name",
      placeholder: "who's writing",
      autoComplete: "name",
      inputType: "text",
    },
    {
      name: "email",
      label: "email",
      placeholder: "where I reply",
      autoComplete: "email",
      inputType: "email",
    },
    {
      name: "message",
      label: "message",
      placeholder: "what's on your mind",
      autoComplete: "off",
      multiline: true,
    },
  ] satisfies ContactFieldCopy[],

  submit: "send",
  sending: "sending",

  sentTitle: "Sent.",
  sentBody: "That's in my inbox. I'll come back to you, usually within a day or two.",
  sendAnother: "Send another",

  failedTitle: "That didn't send.",
  failedBody:
    "My end, not yours, and nothing you wrote is lost. The button below opens the same message in your mail app. If that does nothing, copy it and paste it into whatever you do use.",
  failedOpen: "Open it in your mail app",
  failedCopy: "Copy the message",
  failedCopied: "Copied",
  failedCopyFailed: "That didn't copy either. Select the message above and copy it yourself.",

  directLabel: "Or reach me directly",
  honeypotLabel: "Leave this field empty",
} as const;
