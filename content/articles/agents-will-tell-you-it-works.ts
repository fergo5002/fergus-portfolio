import type { Article } from "../articles";

export const verificationGap: Article = {
  slug: "agents-will-tell-you-it-works",
  title: "Agents will tell you it works. Make them prove it.",
  description:
    "The most expensive habit in AI-assisted development is taking a confident summary as evidence. A short protocol for closing the gap between done and proven.",
  date: "2026-08-08",
  tags: ["AI agents", "Testing", "Process", "Engineering"],
  summary:
    "A verification protocol for AI-assisted development: require pasted evidence rather than assertions, delete the fix to confirm the test actually fails, and check the live deployment rather than trusting a successful build. Covers the specific failure modes that produce false 'done' claims.",
  body: `"The endpoint now returns the booking and the tests pass." That was the completion report. Neither half of it was true, and finding that out took me longer than writing the feature would have. This is the protocol I use now so that it cannot happen quietly again.

There was no endpoint. There was a route file that would have worked if a table it referenced existed, and a test that asserted a mock returned what the mock was configured to return.

The agent wasn't lying. It had no mechanism for knowing, so it reported the likely outcome in the grammar of an observed one. That grammar is the problem: "returns" and "would probably return" look identical in a summary, and only one of them is a fact.

Here's the protocol I use now. It's short, it's boring, and it has caught more real defects than any amount of reading diffs.

## Rule one: where is the evidence?

Any statement that something works must be accompanied by the output that shows it, in the same message.

Not "the migration applied cleanly". Instead, the psql output. Not "the build is green". Instead, the last fifteen lines of the build. Not "the booking appears in the diary". Instead, the row.

This sounds pedantic. It is pedantic. It also changes behaviour immediately, because an agent that has to paste output has to actually run the thing, and running the thing is where the discovery happens.

The tell to watch for is the conditional tense leaking into a completion report. "Should", "would", "is expected to". Those words are the agent telling you it reasoned rather than observed, and they're worth treating as a hard stop.

## Rule two: does the bug come back if you delete the fix?

A test written alongside a fix, by the same author, tests what the code does. That's not the same as testing what the code should do, and the difference is invisible when everything is green.

The check that separates them takes thirty seconds. Revert the fix. Run the test. Watch it go red.

If it stays green, the test never exercised the bug. You have a passing suite and an open defect, which is worse than a failing suite because it comes with a false sense of coverage.

I do this on anything that matters and always on anything security-related. When we moved from [a shared webhook secret to per-install secrets](/writing/one-webhook-secret-two-tenants), the reason I believed the fix was not that the new tests passed. It was that putting the vulnerability back turned the cross-tenant test red, on cue.

## Rule three: local success is a hypothesis

Working on your machine tells you the code is not obviously broken. It does not tell you it will work where it's going.

The list of things that differ, all of which I've been bitten by: Node version, a stale lockfile resolving a package the clean install won't, an environment variable that exists in your shell and nowhere else, and a case-insensitive filesystem forgiving an import that Linux refuses.

A container that mirrors the production runtime, doing a clean install from the lockfile and running the real build and start commands, converts a hypothesis into a fact for about ninety seconds of your time.

Important: not a development container with your working tree mounted in. That reproduces your machine, which is the thing you're trying to escape. Build the artefact.

## Rule four: a successful deploy is not a working feature

This is the expensive one, because the failure is silent by construction.

I had a fix sit on the main branch for three days, believed live, while production served the old bundle. Every deployment was being refused for an account-side reason that surfaced nowhere a person would look. Git exited zero. The CLI kept politely polling. The dashboard showed a state that renders as "unknown", which reads exactly like "still building".

Four checks now close every deploy:

1. **The deployed commit is the commit you think it is.** Ask the platform API, not the dashboard.
2. **The health endpoint returns 200 on the live host.** The real hostname, not a preview URL.
3. **The exact flow you changed works against production.** Not a smoke test of the homepage. The thing you touched.
4. **The live logs show your request.** Find the log line for the request you just made.

The fourth is the one people skip and it's the one that catches the interesting failures. Plenty of broken things return 200. Seeing your own request in the log is what proves the code path you intended is the code path that ran, rather than a cached response or a stale build serving something that merely looks similar.

## Rule five: could this check ever have failed?

If the answer is no, the check proves nothing and you should delete it. This is a specific trap, and I have watched it cost a day.

We verify analytics by checking a script loads. The obvious check is to curl the documented script path. That path 404s on a working deployment, because the real script is served from a per-deploy hashed URL, and the pretty path is only a fallback string inside the package.

So the check reports failure while the feature works perfectly. Someone then "fixes" the working feature.

The inverse is more common and more dangerous: a check that passes regardless of whether the feature works. Asserting a page returns 200 when the failure mode is a page returning 200 with an error rendered inside it. Asserting a queue accepted a job when the question was whether a worker ran it.

Before trusting any verification, ask what it would look like if the feature were broken. If the answer is "the same", it isn't a verification, it's a ritual.

## Why is this worth the friction?

None of this is clever. It's the discipline any careful engineer applies without naming it, written down because the thing doing the work now has no instinct for doubt. The wider set of habits is in [what I actually changed to ship with AI agents](/writing/shipping-with-ai-agents).

Agents are fast and getting faster. Speed multiplies whatever process you have. With this protocol you find defects in minutes. Without it you find them in production, in a fortnight, in a flow you'd forgotten you touched.

The friction is about ten minutes a change. It is the cheapest ten minutes in the whole loop.`,
};
