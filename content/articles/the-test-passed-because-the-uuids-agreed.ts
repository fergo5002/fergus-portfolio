import type { Article } from "../articles";

export const uuidsAgreed: Article = {
  slug: "the-test-passed-because-the-uuids-agreed",
  title: "The test passed because the UUIDs agreed",
  description:
    "A deadlock test ran eight concurrent rounds against broken code and reported nothing. Changing which ids the fixture generated turned it into six failures.",
  date: "2026-09-02",
  tags: ["PostgreSQL", "Concurrency", "Testing", "Booking"],
  summary:
    "How a Postgres deadlock in a group-booking path survived a green concurrency test: the lock order only inverts when two rooms disagree about which overlapping window sorts lower, which randomly generated UUIDs rarely do. With ids chosen to disagree, the same control gives six deadlocks in eight rounds against the broken function, and none in six rounds against the fix.",
  body: `A sauna venue can be booked whole. One customer takes every barrel for the hour, and the software has to hold all of them or none of them. I wrote that, convinced myself it could not deadlock, and was wrong. The test that should have caught it ran eight concurrent rounds and reported nothing, which is the part worth writing down.

## What actually deadlocks here?

The textbook fix for a deadlock is to take your locks in a consistent order, so I sorted the selections by id before locking them. My reasoning was that a single-room hold confines its lock set to that one room, so two of them cannot form a cycle.

That was true, and it was irrelevant. The single-room hold reaches past the selection it was handed and locks every *overlapping* session in the same room, because those are the rows whose capacity it has to check. So the real acquisition sequence is room A's whole set, then room B's whole set. Two sorted sets stuck end to end are not a sorted set.

Two groups booking overlapping windows across the same two barrels can therefore walk those rooms in opposite orders and meet in the middle. The fix is to stop letting the per-room function choose: take one lock statement over the union of everything the transaction will touch, ascending, before any of them runs.

As bugs in a booking system go this is one of the milder ones, and that is worth saying. Postgres detects the cycle, kills one side and reports it, so the damage is a failed checkout rather than two people sold the same bench. Loud and retryable beats quiet and wrong. It still has to go.

\`\`\`sql
for v_row in
  select o.id
    from app.occurrences o
   where o.room_id in (
           select sel.room_id from app.occurrences sel where sel.id = any(v_ordered)
         )
     and o.status = 'scheduled'
     and tstzrange(o.starts_at, o.ends_at, '[)')
         && tstzrange(v_first.starts_at, v_first.ends_at, '[)')
   order by o.id
     for update
loop
  perform app.reap_expired_holds(v_row.id);
end loop;
\`\`\`

## Why did the first version of the test find nothing?

Because whether the cycle forms at all depends on the two rooms disagreeing about which of their overlapping windows sorts lower. If both rooms happen to order their sessions the same way, both transactions walk the same path, one queues politely behind the other, and everything commits.

The fixture generated its ids with \`gen_random_uuid()\`. Random ids usually agree. So the control span eight rounds of genuine concurrency against genuinely broken code and came back green, and I would have shipped it believing the opposite of what it measured. The test was sampling the id generator, not the lock order.

## What happens when the ids are chosen to disagree?

Pin the ids so the two rooms sort their overlapping windows in opposite directions, change nothing else about the test, and the same control behaves completely differently.

\`\`\`chart
{
  "kind": "bar",
  "title": "Deadlocks observed",
  "categories": ["Broken, random ids", "Broken, chosen ids", "Fixed, chosen ids"],
  "series": [{ "label": "deadlocks", "values": [0, 6, 0] }],
  "caption": "Two concurrent group holds on overlapping windows across the same two rooms. Eight rounds against the broken function, six against the fixed one. Measured 2 September 2026."
}
\`\`\`

The middle bar is the whole finding. Same test, same concurrency, same schema, one variable moved. The bug was present for every one of those first eight rounds and the suite could not see it, and the fix only counts as a fix because putting the broken version back brings the deadlocks with it.

## What do you take from this?

A green concurrency test tells you nothing until you have watched it go red. That sounds obvious written down, and I still nearly shipped the other way round, because a passing test feels like evidence and an unexercised one feels the same.

So the rule I use now is to break the thing on purpose first. Run the control against the known-bad version and confirm the failure, then apply the fix and confirm it goes away, then put the bad version back one more time and confirm it returns. Anything less and you have measured your own optimism.

The second rule is narrower and I had not internalised it: randomness in a fixture is not coverage. \`gen_random_uuid()\` hands you one arbitrary point out of an enormous space. If the bug lives in an ordering, an arbitrary point will nearly always miss it, and it will miss it quietly, eight times in a row, in a suite you are about to trust.`,
};
