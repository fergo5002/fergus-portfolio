import type { Article } from "../articles";

export const uuidsAgreed: Article = {
  slug: "the-test-passed-because-the-uuids-agreed",
  title: "The test passed because the UUIDs agreed",
  description: "Eight concurrent rounds missed a booking deadlock. Choosing different fixture IDs made the same broken function fail six times.",
  date: "2026-09-02",
  updated: "2026-09-06",
  tags: ["PostgreSQL","Concurrency","Testing","Booking"],
  summary: "A group-booking deadlock survived a concurrency test whose fixture never exercised the conflicting lock order. Chosen IDs exposed six deadlocks in eight rounds against the broken function; a union of locks acquired in one order completed six rounds without a deadlock.",
  body: `A sauna venue can be booked whole: one customer takes every barrel for the hour. The software has to hold all of them or none.

I wrote that path, sorted the selections by ID before locking them, and thought I'd dealt with deadlocks. The test ran eight concurrent rounds against the broken function and passed every one.

## I had sorted the wrong set

The single-room hold didn't just lock the session it was given. It also locked the overlapping sessions in that room to check their remaining capacity.

So sorting the initial selections wasn't enough. A transaction could acquire room A's overlapping set and then room B's, while another transaction walked the rooms in the opposite order. Both had started from sorted selections.

The fix was to gather the rows the transaction would touch and lock the union in ascending ID order before calling the per-room functions.

This was the lock acquisition in that fix:

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

Postgres detected the deadlock and aborted one transaction. The result was a failed checkout, rather than two customers getting the same capacity. It still needed fixing.

## Why the control stayed green

The fixture used \`gen_random_uuid()\`. The IDs it produced didn't exercise the ordering conflict between the rooms. Running more concurrent rounds with that fixture kept exercising the same harmless ordering.

I changed the IDs so the overlapping windows sorted in opposite directions in the two rooms. The schema, booking requests and concurrent test stayed the same.

| Function and fixture | Rounds | Deadlocks |
| --- | --- | --- |
| Broken, random IDs | 8 | 0 |
| Broken, chosen IDs | 8 | 6 |
| Fixed, chosen IDs | 6 | 0 |

Each round ran two concurrent group holds across the same two rooms. Measured 2 September 2026.

The broken function now deadlocked in six of eight rounds. With the fix restored, six rounds completed without a deadlock.

The first version of this article said random IDs would usually miss the bug. That was broader than the test showed. What I had was one fixture that missed it and a deliberately chosen one that exposed it. The chosen IDs stayed in the regression test.`,
};
