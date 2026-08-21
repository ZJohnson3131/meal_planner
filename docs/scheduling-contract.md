# Scheduling Contract

## MVP calendar policy

The MVP uses the user's browser-local calendar. Planned dates are calendar
values (`YYYY-MM-DD`), not timestamps and not UTC dates.

- A browser obtains "today" from local `Date` fields and sends the explicit
  `YYYY-MM-DD` value in a query or form field.
- Server pages and actions validate that explicit value. They do not derive a
  default from the server clock or from UTC fields.
- If an SSR request has no valid date, it must ask the client for one (for
  example, a client-side redirect with `weekStart`) or render a date chooser.
  It must not guess the user's timezone.
- Calendar arithmetic starts from the validated string and uses the helpers in
  `lib/domain/calendar.ts`. A neutral UTC `Date` may be used internally for
  arithmetic or formatting, but it does not represent an instant and must not
  be persisted as one.

Weeks begin Monday and end Sunday. `calendarWeekRange` and
`calendarWeekDates` are deliberately bounded to exactly seven days. The
four-digit supported year range is 0001 through 9999, matching the HTML date
shape used by this application; year zero, malformed values, and impossible
dates are rejected.

There is no household timezone setting in the local-first MVP. A future
multi-user or scheduled-integration phase must introduce an explicit household
calendar zone before server-originated date defaults, reminders, or timed meal
events are added.

## Dinner lifecycle

The MVP schedules one default Dinner slot per household and date. The database
RPCs own every mutation and lock the entry before deciding the result.

| Operation | Missing | Planned | Skipped | Completed |
| --- | --- | --- | --- | --- |
| Assign recipe | Create planned | Replace recipe, remain planned | Replace recipe, restore planned | Reject |
| Skip | Reject | Move to skipped | Retry-safe no-op | Reject |
| Restore | Reject | Retry-safe no-op | Move to planned | Reject |
| Complete | Reject | Deduct and move to completed | Reject | Retry-safe no-op |
| Reverse completion | Reject | Retry-safe no-op | Reject | Restore deductions and move to planned |

The actual state edges are therefore:

- `planned -> skipped`
- `skipped -> planned`
- `planned -> completed`
- `completed -> planned` only through confirmed completion reversal

Assignment is not completion reversal. It may create an entry or restore a
skipped entry, but it cannot modify a completed entry. A completed recipe/date
can change only after its recorded pantry effects are reversed successfully.
Skipping never applies or reverses pantry changes.

The retry-safe results above exist for duplicate requests after a successful
RPC. They do not authorize direct table writes or a client-side read/check/write
sequence. UI state is advisory; the RPC result is authoritative. Invalid or
concurrently superseded operations must surface as recoverable errors and cause
the planner data to refresh.

The state machine is slot-agnostic, but current RPC authorization deliberately
restricts it to the household's default Dinner slot. Future breakfast, lunch,
snack, and custom slots should reuse the state machine while changing the RPC
to accept and authorize an explicit slot identity. Do not infer slot semantics
from sort order.

## Caller guidance

### Next.js application

- Accept explicit `YYYY-MM-DD` query/form values, validate with
  `parseIsoCalendarDate`, and normalize week selections with
  `startOfCalendarWeek`.
- Call only `assign_dinner`, `set_dinner_status`,
  `complete_meal_plan_entry`, and `reverse_meal_completion_deductions` for the
  corresponding operations. Do not preflight status with a separate query as a
  security or concurrency decision.
- Treat rejected transitions, missing entries, and reversal-review failures as
  action errors; refresh data after success or conflict.

### Frontend

- Create the initial date with `localCalendarDate(new Date())` in browser code,
  then pass the explicit value to server routes and actions.
- Use `calendarWeekDates` for the seven rendered dates. For display, use
  `calendarDateToNeutralDate` with an `Intl.DateTimeFormat` configured with
  `timeZone: "UTC"`; this formats the calendar projection without moving it to
  another local day.
- Expose actions by current status, but keep controls pending-safe and display a
  recoverable conflict if the database rejects stale UI state.

### Tests

- Cover invalid syntax and impossible dates, century leap-year rules, month and
  year boundaries, and Monday/Sunday normalization.
- In an Adelaide timezone process, verify that browser-local early Monday maps
  to that Monday even while UTC is Sunday, including dates on both sides of the
  daylight-saving transition.
- Run two-client database tests for assignment versus completion, skip versus
  completion, repeated completion, and reversal versus assignment. Assert the
  status and pantry ledger remain consistent after both requests settle.
- Test every table cell above and verify that invalid transitions do not mutate
  recipe identity, pantry quantities, or deduction history.
