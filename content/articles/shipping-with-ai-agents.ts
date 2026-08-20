import type { Article } from "../articles";

export const agentsShipping: Article = {
  slug: "shipping-with-ai-agents",
  title: "What I actually changed to ship with AI agents",
  description:
    "Nine months of building products with coding agents. The four habits that stopped things breaking in production, and the one that mattered most.",
  date: "2026-08-18",
  tags: ["AI agents", "Engineering", "Claude Code", "Process"],
  summary:
    "Practical working practices for shipping production software with AI coding agents: proving changes with evidence rather than assertions, prod-parity containers, post-deploy verification, and a written mistake ledger the agent reads before it starts.",
  body: `I've built and shipped three products with coding agents doing most of the typing. Two of them had real customers and real money moving through them. One of them I wound down.

The code was rarely the problem. What broke, repeatedly, was everything around the code.

Here's what I changed.

## The agent will tell you it works. It doesn't know.

This is the whole thing. Everything else is a consequence of it.

An agent finishes a task and says the feature is working. It is not lying and it is not being careless. It genuinely has no way to know. It wrote something that looks right, the types check, and in the absence of evidence "looks right" is all it has. So it reports the most probable outcome as though it were the observed one.

I stopped accepting that. The rule now is simple and it is absolute: **no claim without evidence in the same breath.**

Not "the endpoint should return the booking". Instead: here is the request I sent, here is the response body, here is the row that appeared in the database. If there's no output pasted, the task isn't done. It's in progress.

This one change caught more bugs than every other practice combined, and most of them were the boring kind that cost you a day in production and nothing at all in development. The full protocol is in [agents will tell you it works](/writing/agents-will-tell-you-it-works).

## Local success means less than you think

"Works on my machine" was already a joke before agents. It's worse now, because an agent iterates fast enough to accidentally fit the shape of your local environment rather than the shape of the problem.

The specific failures I hit were dull and all the same underneath: a package that resolved locally from a stale lockfile, a Node version that differed from the deploy target, an environment variable that existed in my shell and nowhere else, and a case-insensitive filesystem quietly forgiving an import that Linux would refuse.

The fix is a container that mirrors production: same runtime version, same install path, clean install from the lockfile, same build command, same start command. Not a development container with your source mounted in. A build of the artefact you're about to ship.

\`\`\`dockerfile
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
\`\`\`

If it builds and serves there, the thing that reaches production is the thing you tested. If it doesn't, you found out in ninety seconds rather than after a deploy.

## Deploying is not shipping

The gap between "the deploy succeeded" and "a person can use this" is where I've lost the most time, by a distance.

I once had three days of work sitting on the main branch, believed to be live, while production quietly served the old bundle. The deployments were being refused for an account reason that produced no error anywhere a person would look. Git exited zero. The dashboard showed nothing red. The status note in the repo said "shipped".

Now every deploy ends with the same checks, and an agent runs them rather than assuming:

1. Confirm the deployed commit is the commit you think it is.
2. Confirm the health endpoint returns 200 on the live host.
3. Exercise the exact flow you changed, against the live URL, not a preview.
4. Read the live logs for the request you just made.

Only then does it count. Anything short of that is a hypothesis.

The subtle one is the fourth. Plenty of broken things return 200. Reading the log line for your own request is what tells you the code path you meant to run is the one that ran.

## Write down mistakes, not lessons

The habit that compounds is a plain markdown file recording things that went wrong. Not vague principles. Specific failures, with the root cause and a rule that would have prevented them.

Two entries as they actually look:

> Summed an order-total column across shops without grouping by currency. The shops store totals in their own currency, so the figure mixed euro and sterling and published high. Rule: never aggregate money across tenants without grouping by currency, and never pick an exchange rate to make a bigger number.

> Put a backtick inside a GLSL comment. The shaders are template literals, so the string terminated there and the build failed hundreds of lines from the cause. Rule: no backticks in shader source, ever.

Neither of those is clever. Both cost real hours. Neither has happened twice.

The reason this works with agents specifically is that an agent has no memory of last Tuesday, but it reads files very well. A ledger it consults before starting is institutional memory it can actually use. Repeat offenders get promoted from a note into a test or a lint rule, so the machine enforces it instead of the document asking nicely.

## What I stopped doing

**I stopped reviewing diffs line by line.** I read the interfaces, the data model and the error paths. Reading every line is slower than the agent produces them and it lulls you into thinking review is coverage. Tests are coverage.

**I stopped asking for plans I then approve.** Approving a plan feels productive and proves nothing. I'd rather answer hard questions once at the start, then look at working software.

**I stopped trusting a green test suite on its own.** A suite an agent wrote alongside the code tests what the code does, which is not the same as what it should do. The check I trust is deleting the fix and watching the test go red. If it stays green, the test was decoration.

## The honest summary

The agents are good. Genuinely, surprisingly good, and better every few months.

What they lack is the thing an experienced engineer supplies without noticing: a nagging sense that something might not be true. The whole discipline above is scaffolding around that one absence. Make it prove things, give it a real environment to prove them in, check production afterwards, and write down what went wrong so it can't quietly go wrong again.

Do that and you can move very fast. Skip it and you'll move fast for about a fortnight, then spend a month finding out what you shipped.`,
};
