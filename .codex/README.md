# FergusOS in Codex

Use `C:\Dev\fergus-portfolio` as the primary folder for the saved Personal Website
project. The older OneDrive folder with that label is an empty Git repository and is not
the site.

For a new feature, start a new task under the saved repository project, select Worktree,
choose the FergusOS local environment and base it on freshly fetched `origin/main`. Do not
choose Working tree unless the task is explicitly continuing the uncommitted analytics work
in the root checkout. Returning to the task returns to its managed worktree.

`environments/environment.toml` pins the expected Node 24 major and runs `npm ci`. It starts
no server, copies no `.env` file, uses no credential and changes no external system. Dev
server, typecheck, tests, build, mutation, phone, arcade-phone and Git-status actions are
available from the project toolbar. The phone actions expect a production or development
server already listening on port 3000. Playwright browser installation remains an explicit
one-off machine action.

Before substantive work, read the repository `AGENTS.md` from top to bottom and the current
section of `docs/PROGRESS.md` or the relevant Toolshed spec/plan. Retrieve durable context with
a focused query, for example:

```powershell
python C:\Users\oreil\.codex\context\context_index.py query "personal website toolshed roadmap" --scope memory --limit 6 --max-chars 12000
```

The maintained entry point is
`C:\Users\oreil\.codex\brain\notes\personal-site.md`. Worktree ownership is in
`personal-site-worktrees.md`; personal Vercel and related service routing is in
`personal-site-connections.md`.

The root checkout contains pre-existing uncommitted analytics work. Preserve it. A push to
`main` can trigger production, so project setup and local implementation never imply authority
to push, merge, change account settings or deploy.

These `.codex` files are local, uncommitted project setup. A managed worktree can use the
saved project's inline environment definition, but a new clone or another machine needs this
configuration transferred or committed deliberately.

The environment was validated on 5 September 2026 in a fresh detached worktree: install,
typecheck, 2,420 tests and the 43-route production build all passed. The install currently
reports nine npm advisories. Treat dependency remediation as a separate tested change, not an
automatic `npm audit fix`.
