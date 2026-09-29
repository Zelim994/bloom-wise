# Local invitation concurrency regression

Run from this worktree after starting the dedicated `bloomwise-e2e` stack and installing `e2e/supabase/migrations/20260929164412_serialize_team_invitation_acceptance.sql` locally:

```sh
node scripts/team-invitation-concurrency.mjs
```

The script refuses any API except 127.0.0.1:54421 or database except 127.0.0.1:54422 and verifies the canonical local baseline. It never applies migrations, resets the stack or connects to production. Do not run alongside another invocation of this test.

Each acceptance uses an actual signed-in Supabase client over the authenticated HTTP RPC path. Local administrator access only creates fixtures, observes rows, holds the synchronization barrier and deletes exact fixtures. No invitation tokens, passwords or session keys are printed or saved. The safe result is saved as `BW-RACE-<UUID>.json` in the OS temporary directory.

The barrier locks fixture profile rows until two PostgREST requests are simultaneously waiting. Backend PIDs and blocking-PID edges must connect both waiters to this barrier before it is released. Checks cover one link/two users, one link/two calls by one user, and two links from different salons for one user. Only one call may succeed; invitation accepted_by, profile organization and role must agree. The loser must receive the existing domain error, not an unobserved transport failure.

All sessions are signed out locally and only recorded test users, their invitations and their salons are removed. Nonzero exit indicates a failed check or cleanup; inspect the recorded result before another run. No emails are sent. The invitation remains a bearer link: invited_email is a note, not a recipient authorization rule.
