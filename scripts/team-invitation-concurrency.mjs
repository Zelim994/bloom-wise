// Local-only authenticated HTTP regression; secrets and bearer links stay in memory.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
const w = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const d = JSON.parse(execFileSync("supabase", ["--workdir", w + "/e2e", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
if (d.API_URL !== "http://127.0.0.1:54421" || new URL(d.DB_URL).port !== "54422" || new URL(d.DB_URL).hostname !== "127.0.0.1")
    throw Error("Local guard");
const admin = createClient(d.API_URL, d.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = "BW-RACE-" + crypto.randomUUID(), users = [], orgs = [], results = [], sql = [], pending = [];
let blocker;
const ok = (b, s) => {
    if (!b)
        throw Error(s);
};
const record = x => {
    results.push(x);
    console.log(JSON.stringify(x));
};
const delay = ms => new Promise(r => setTimeout(r, ms));
async function db() {
    const c = new Client({ connectionString: d.DB_URL });
    await c.connect();
    sql.push(c);
    await c.query("set statement_timeout='15s'; set log_statement='none'; set log_min_error_statement='panic'");
    return c;
}
async function user(n, org = false) {
    const email = (marker + "-" + n).toLowerCase() + "@example.com", password = crypto.randomBytes(24).toString("base64url");
    const r = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    ok(!r.error, "fixture user");
    const u = { id: r.data.user.id, email, client: createClient(d.API_URL, d.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }) };
    users.push(u);
    ok(!(await u.client.auth.signInWithPassword({ email, password })).error, "fixture login");
    if (org) {
        const r = await u.client.rpc("create_my_organization", { p_org_name: marker + "-" + n });
        ok(!r.error, "fixture org");
        u.org = r.data;
        orgs.push(u.org);
    }
    return u;
}
async function invitation(owner, role = "viewer") {
    const r = await owner.client.rpc("create_team_invitation", { p_role: role, p_invited_email: "note-only@example.com" });
    ok(!r.error && r.data.ok, "fixture invite");
    return r.data;
}
async function race(owner, actors, label, different = false, secondOwner = owner) {
    const inv = await invitation(owner);
    const inv2 = different ? await invitation(secondOwner, "cashier") : inv;
    const observer = await db();
    blocker = await db();
    await blocker.query("begin");
    await blocker.query("select id from public.profiles where id=any($1::uuid[]) order by id for update", [actors.map(x => x.id)]);
    const blockerPid = (await blocker.query("select pg_backend_pid() as pid")).rows[0].pid;
    const started = Date.now();
    const calls = actors.map((a, i) => a.client.rpc("accept_team_invitation", { p_token: (i === 1 ? inv2 : inv).token }).then(r => ({ data: r.data, error: r.error ? { code: r.error.code } : null, elapsed_ms: Date.now() - started })));
    pending.push(...calls);
    let waiting = 0;
    let lockWaits = [];
    for (let i = 0; i < 100; i++) {
        const r = await observer.query("select pid, pg_blocking_pids(pid) as blockers from pg_stat_activity where usename='authenticator' and state='active' and wait_event_type='Lock' and query like '%accept_team_invitation%'");
        lockWaits = r.rows;
        waiting = lockWaits.length;
        if (waiting === 2)
            break;
        await delay(30);
    }
    ok(waiting === 2, "overlap not established");
    const pids = new Set(lockWaits.map(row => row.pid));
    ok(lockWaits.some(row => row.blockers.includes(blockerPid)) && lockWaits.every(row => row.blockers.some(pid => pid === blockerPid || pids.has(pid))), "barrier linkage missing");
    await blocker.query("commit");
    blocker = null;
    const responses = await Promise.all(calls);
    const profiles = (await observer.query("select id,organization_id,role from public.profiles where id=any($1::uuid[]) order by id", [actors.map(x => x.id)])).rows;
    const invitations = (await observer.query("select id,organization_id,role,accepted_by,accepted_at is not null as accepted from public.team_invitations where id=any($1::uuid[]) order by id", [[inv.invitation_id, inv2.invitation_id]])).rows;
    const successes = responses.filter(r => r.data?.ok).length;
    const joined = profiles.filter(p => p.organization_id !== null);
    const pass = responses.every(r => !r.error && (r.data?.ok || r.data?.error === (different ? "already_in_organization" : "invitation_not_found_or_expired"))) && successes === 1 && joined.length === 1 && invitations.filter(i => i.accepted).length === 1 && invitations.filter(i => i.accepted).every(i => joined.some(p => p.id === i.accepted_by && p.role === i.role && p.organization_id === i.organization_id));
    record({ case: label, overlap: { both_authenticated_http_requests_waiting_on_db_locks: waiting, blockerPid, lockWaits, barrier: "transaction locks exact fixture profile rows; release only when both PostgREST backends wait", held_ms: Date.now() - started }, responses, profiles, invitations, PASS: pass });
    return pass;
}
(async () => {
    let clean = false;
    try {
        const c = await db();
        const m = await c.query("select count(*)::int n from supabase_migrations.schema_migrations where version='20260911180000'");
        ok(m.rows[0].n === 1, "baseline guard");
        const owner = await user("owner", true), a = await user("a"), b = await user("b"), same = await user("same");
        await race(owner, [a, b], "one-invitation-two-users");
        await race(owner, [same, same], "one-invitation-same-user");
        const x = await user("two-links"), second = await user("owner-other", true);
        await race(owner, [x, x], "two-invitations-same-user", true, second);
    }
    catch (e) {
        record({ STOP: true, reason: /^[a-z -]+$/.test(e.message) ? e.message : "details suppressed" });
        process.exitCode = 1;
    }
    finally {
        if (blocker)
            await blocker.query("rollback").catch(() => {
            });
        await Promise.allSettled(pending);
        for (const c of sql)
            await c.end().catch(() => {
            });
        try {
            for (const u of users)
                await u.client.auth.signOut({ scope: "local" });
            for (const id of orgs)
                ok(!(await admin.from("team_invitations").delete().eq("organization_id", id)).error, "cleanup invitations");
            for (const u of users)
                ok(!(await admin.auth.admin.deleteUser(u.id)).error, "cleanup user");
            for (const id of orgs)
                ok(!(await admin.from("organizations").delete().eq("id", id)).error, "cleanup org");
            for (const [t, col, ids] of [["profiles", "id", users.map(u => u.id)], ["organizations", "id", orgs], ["team_invitations", "organization_id", orgs]]) {
                if (ids.length) {
                    const r = await admin.from(t).select("id").in(col, ids);
                    ok(!r.error && r.data.length === 0, "remaining rows");
                }
            }
            const list = await admin.auth.admin.listUsers({ perPage: 1000 });
            ok(!list.error && !list.data.users.some(u => users.some(x => x.id === u.id)), "remaining users");
            clean = true;
        }
        catch {
        }
        record({ cleanup: clean, remaining: clean ? { users: 0, profiles: 0, organizations: 0, invitations: 0 } : null });
        fs.writeFileSync(path.join(os.tmpdir(), marker + ".json"), JSON.stringify({ marker, at: new Date().toISOString(), users: users.map(u => u.id), orgs, results }, null, 2));
        if (!clean || results.some(r => r.PASS === false || r.STOP))
            process.exitCode = 1;
    }
})();
