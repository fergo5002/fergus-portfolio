/** Words for the 404 page: a channel with nothing on it. */
export const notFoundCopy = {
  title: "no signal",
  line: "Nothing is broadcasting on this channel. Try one of these.",
  /** Printed after the path the visitor asked for, the way a shell would say it. */
  missing: "no such directory",
  links: [
    { href: "/", label: "cd ~" },
    { href: "/writing", label: "cd writing" },
    { href: "/projects", label: "cd projects" },
    { href: "/tools", label: "cd tools" },
  ],
} as const;
