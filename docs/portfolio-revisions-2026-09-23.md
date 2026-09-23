# Portfolio revisions, 23 September 2026

Fergus requested a shorter homepage, integrated navigation, a quieter writing
index, a smaller tool selection and coffee/call requests inside the CRT design.
He chose the headline “I build things. Then I scale them.” and 30-minute meetings
on weekdays between 10am and 5pm. Requests go to the existing contact inbox and
are explicitly subject to confirmation by email. Offered slots are deterministic;
there is no calendar integration or fabricated appointment record.

Implemented:

- Homepage shell moved into the common drawer. Skills removed. Opaque work
  previews link to project or experience anchors; direct About links lead onward.
- Contact invitation uses one heading, a message button and two illustrated
  meeting cards. Server-validated Irish-time requests work without JavaScript.
- Hatch105 sits below Tigh; the NEW badge and student fund entry are removed.
- Writing dates span 23 July to 16 September at Fergus's request. The short new
  article explains reservation leases with an illustrative interactive diagram.
- The tools index features Atlas, Pocket Redact, Group Lore, Relief and Resonance.
  Other routes, sitemap entries and existing tool functionality remain available.
- Remand now shows Reddit questions leading to a positioning idea.
- The arcade returns the normal navigation after its entrance. The drawer closes
  outside and preserves history. Bottom controls retain visible labels on phones.

Verification before release:

- 2,591 unit tests passed, three opt-in integrations skipped; TypeScript passed.
- New calendar logic first failed without its implementation, then passed, including
  Irish daylight-saving time, forged/stale slots and provider failure.
- Desktop and WebKit 390/320 meeting journeys passed, including failed-send field
  preservation and a real no-JavaScript POST. No external email sent at this stage.
- The delayed-hydration selection loss was reproduced before correction and the
  same scenario passed afterwards. The mobile preview overflow was observed in
  screenshot and document bounds, then corrected by stacking the links.
- A fresh Node 24 Docker production build passed all 2,591 tests. Desktop and
  WebKit 390/320 enhanced meeting flows and delayed-hydration preservation passed
  against that container. Native no-JavaScript Tab/Enter submissions preserved
  fields after provider failure. The automated pointer click intermittently timed
  out before sending, so that check now verifies native keyboard submission.
- Calendar pixel contrast, 44px targets and layout checks passed at 390px, 320px
  and throttled Chromium. Shared shell/arcade navigation checks passed locally.
- All four CI mutation shards passed. The full browser release gate is being
  rerun after correcting two test selectors. Canonical production verification
  remains pending.
