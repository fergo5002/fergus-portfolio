import { profile } from "@/content/profile";

/**
 * A static, decorative "user@host:path$ command" line used as a heading device
 * above sections. Purely presentational.
 */
export default function PromptLine({
  command,
  user = profile.user,
  host = profile.host,
  path = "~",
}: {
  command: string;
  user?: string;
  host?: string;
  path?: string;
}) {
  return (
    <p className="promptline">
      <span className="promptline__user">
        {user}@{host}
      </span>
      <span className="promptline__sep">:</span>
      <span className="promptline__path">{path}</span>
      <span className="promptline__dollar">$</span>
      <span className="promptline__cmd">{command}</span>
    </p>
  );
}
