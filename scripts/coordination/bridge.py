"""Serial, tool-free Claude reviewer. Codex owns mutations and evidence checks."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time
import tempfile

SCHEMA = {"type": "object", "additionalProperties": False, "properties": {
    "task_id": {"type": "string"}, "status": {"type": "string", "enum": ["complete", "needs_input"]},
    "summary": {"type": "string"}, "findings": {"type": "array", "items": {"type": "string"}},
    "evidence": {"type": "array", "items": {"type": "string"}}, "next_step": {"type": "string"}},
    "required": ["task_id", "status", "summary", "findings", "evidence", "next_step"]}


def redact(value):
    if isinstance(value, dict):
        return {k: '[REDACTED]' if re.fullmatch(r'(?i)(password|cookie|access_token|refresh_token|authorization|api_key|apikey|token|secret|service_role)', k)
                else redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if not isinstance(value, str):
        return value
    value = re.sub(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_JWT]', value)
    value = re.sub(r'(?i)(bearer\s+)[A-Za-z0-9_.-]+', r'\1[REDACTED]', value)
    return re.sub(r'(?i)((?:access_token|refresh_token|password|cookie)\s*[=:]\s*)[^\s,;]+', r'\1[REDACTED]', value)


def error_code(exc):
    # Persist only our static classification codes, never arbitrary exception text.
    return str(exc) if isinstance(exc, RuntimeError) and re.fullmatch(r'[A-Z_]{3,80}', str(exc)) else 'INTERNAL_ERROR'


def save(path, value):
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, prefix=path.name+'.', delete=False) as f:
            tmp = Path(f.name)
            json.dump(redact(value), f, ensure_ascii=False, indent=2)
            f.write('\n')
        tmp.replace(path)
    finally:
        if tmp is not None and tmp.exists():
            tmp.unlink()


def fingerprint(cwd):
    def git(*args):
        return subprocess.check_output(['git', *args], cwd=cwd, stderr=subprocess.DEVNULL)
    try:
        return {"head": git('rev-parse', 'HEAD').decode().strip(),
                "status_sha256": hashlib.sha256(git('status', '--porcelain')).hexdigest(),
                "diff_sha256": hashlib.sha256(git('diff', 'HEAD', '--binary')).hexdigest(),
                "untracked_sha256": hashlib.sha256(b''.join(
                    name + hashlib.sha256((Path(cwd)/os.fsdecode(name)).read_bytes()).digest()
                    for name in sorted(git('ls-files', '--others', '--exclude-standard', '-z').split(b'\0'))
                    if name and (Path(cwd)/os.fsdecode(name)).is_file())).hexdigest()}
    except (subprocess.CalledProcessError, FileNotFoundError):
        raise RuntimeError('GIT_FINGERPRINT_UNAVAILABLE') from None


def session_busy(sid):
    # No command contents are logged. Exact flag argument only, never '--continue'.
    import shlex
    for line in subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True).splitlines():
        try:
            pid, command = line.strip().split(None, 1)
            args = shlex.split(command)
        except ValueError:
            continue
        if int(pid) == os.getpid() or not args:
            continue
        is_claude = 'claude' in args[0].lower() or (Path(args[0]).name in ('node', 'nodejs') and any('claude' in a.lower() for a in args[1:] if not a.startswith('-')))
        if not is_claude:
            continue
        for i, arg in enumerate(args[:-1]):
            if arg in ('--session-id', '--resume', '-r') and args[i+1] == sid:
                return True
    return False


def valid(result, task_id):
    return (isinstance(result, dict) and set(result) == set(SCHEMA['required'])
            and result['task_id'] == task_id and result['status'] in ('complete', 'needs_input')
            and all(isinstance(result[k], str) for k in ('summary', 'next_step'))
            and all(isinstance(result[k], list) and all(isinstance(v, str) for v in result[k])
                    for k in ('findings', 'evidence')))


class Bridge:
    def __init__(self, state_dir, cwd, transport=None):
        self.root, self.cwd = Path(state_dir), Path(cwd)
        self.transport = transport or self.cli
        self.root.mkdir(parents=True, exist_ok=True)

    def cli(self, prompt, state, record):
        sid = state['session_id']
        if session_busy(sid):
            raise RuntimeError('SESSION_BUSY')
        args = [state.get('executable', 'claude'), '-p', '--output-format', 'json',
                '--json-schema', json.dumps(SCHEMA), '--tools', '', '--no-chrome',
                '--strict-mcp-config', '--mcp-config', str(self.root/'empty-mcp.json'),
                '--permission-mode', 'manual', '--permission-prompts', 'host',
                '--settings', str(self.root/'local-settings.json'),
                '--resume' if state.get('started') else '--session-id', sid]
        proc = subprocess.Popen(args, cwd=self.cwd, stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        record.update(pid=proc.pid, status='running')
        save(self.root/'pending.json', record)
        deadline = time.monotonic() + state.get('timeout_seconds', 240)
        first = True
        while True:
            try:
                out, err = proc.communicate(prompt if first else None, timeout=10)
                break
            except subprocess.TimeoutExpired:
                first = False
                print(json.dumps({'event': 'heartbeat', 'task_id': record['task_id'], 'pid': proc.pid}), flush=True)
                if time.monotonic() >= deadline:
                    proc.terminate()
                    try:
                        proc.communicate(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill(); proc.communicate()
                    raise RuntimeError('TIMEOUT_RECONCILE_REQUIRED')
        # Never write raw stdout/stderr: only validated structured payloads and classified errors.
        try:
            envelope = json.loads(out)
        except ValueError:
            envelope = {}
        if envelope.get('permission_denials'):
            raise RuntimeError('PERMISSION_DENIED')
        if proc.returncode != 0 or envelope.get('is_error'):
            # Only failed CLI envelopes may be classified from error text.
            # A successful review can discuss permissions or network failures.
            combined = (str(envelope.get('result', '')) + err).lower()
            if 'permission denied' in combined or 'permission for this action was denied' in combined:
                raise RuntimeError('PERMISSION_DENIED')
            if any(x in combined for x in ('econnreset', 'connection dropped', 'connection reset', 'etimedout')):
                raise RuntimeError('TRANSIENT_NETWORK')
            raise RuntimeError('PROCESS_ERROR_RECONCILE_REQUIRED')
        if envelope.get('session_id') != sid:
            raise RuntimeError('SESSION_ID_MISMATCH')
        state['started'] = True
        save(self.root/'session.json', state)
        return envelope.get('structured_output')

    def run(self, task_id, prompt, expected_evidence=None):
        # Tool-free reviewer cannot repeat an external mutation. Codex receipts gate its own actions.
        if not isinstance(task_id, str) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{0,80}', task_id):
            raise RuntimeError('INVALID_TASK_ID')
        with (self.root/'session.lock').open('a') as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise RuntimeError('SESSION_BUSY') from None
            state = json.loads((self.root/'session.json').read_text())
            digest = hashlib.sha256(prompt.encode()).hexdigest()
            receipt = self.root/(task_id+'.json')
            if receipt.exists():
                old = json.loads(receipt.read_text())
                if old['prompt_sha256'] != digest:
                    raise RuntimeError('TASK_ID_REUSED_WITH_DIFFERENT_PROMPT')
                if old['session_id'] != state['session_id']:
                    raise RuntimeError('SESSION_ID_MISMATCH')
                if expected_evidence is not None:
                    if old['result']['evidence'] != expected_evidence:
                        raise RuntimeError('INDEPENDENT_CHECK_FAILED')
                    old['status'] = 'verified'
                    save(receipt, old)
                return old
            pending = self.root/'pending.json'
            if pending.exists():
                raise RuntimeError('PENDING_RECONCILE_REQUIRED')
            record = {'task_id': task_id, 'session_id': state['session_id'], 'prompt_sha256': digest,
                      'before': fingerprint(self.cwd), 'status': 'prepared', 'attempts': []}
            save(pending, record)
            clarification = False
            transient_count = 0
            base = 'Return the requested JSON schema. task_id=' + task_id + '. You are a tool-free local reviewer; never claim tools were run.\n' + prompt
            request = base
            try:
                while True:
                    try:
                        result = self.transport(request, state, record)
                    except RuntimeError as exc:
                        kind = error_code(exc)
                        record['attempts'].append(kind)
                        save(pending, record)
                        if kind == 'TRANSIENT_NETWORK' and transient_count < 2:
                            transient_count += 1
                            # All attempts are tool-free. Still inspect session/files before another request.
                            record['recovery_snapshot'] = fingerprint(self.cwd)
                            if session_busy(state['session_id']):
                                raise RuntimeError('SESSION_BUSY')
                            # A failed turn may already have persisted its session.
                            if list((Path.home()/'.claude'/'projects').glob('*/'+state['session_id']+'.jsonl')):
                                state['started'] = True
                                save(self.root/'session.json', state)
                            if record['recovery_snapshot'] != record['before']:
                                raise RuntimeError('TREE_CHANGED_RECONCILE_REQUIRED') from None
                            time.sleep(2 * transient_count)
                            request = 'Previous tool-free response was interrupted. Recover only the answer; no actions.\n' + base
                            continue
                        raise
                    if not valid(result, task_id) or result.get('status') == 'needs_input':
                        if clarification:
                            raise RuntimeError('INCOMPLETE_AFTER_CLARIFICATION')
                        clarification = True
                        record['attempts'].append('incomplete_clarification')
                        save(pending, record)
                        request = ('Your previous response was incomplete. Complete all required fields in the same session. '
                                   'No actions should be repeated. Context:\n' + base)
                        continue
                    after = fingerprint(self.cwd)
                    if after != record['before']:
                        raise RuntimeError('TREE_CHANGED_RECONCILE_REQUIRED')
                    if expected_evidence is not None and result['evidence'] != expected_evidence:
                        raise RuntimeError('INDEPENDENT_CHECK_FAILED')
                    record.update(status='verified' if expected_evidence is not None else 'received_pending_review',
                                  result=result, after=after, next_step=result['next_step'])
                    save(receipt, record)
                    state.update(last_task=task_id, last_result=str(receipt), next_step=result['next_step'])
                    save(self.root/'session.json', state)
                    pending.unlink()
                    print(json.dumps({'event': 'result', 'task_id': task_id, 'status': record['status']}), flush=True)
                    return record
            except BaseException as exc:
                record.update(status='reconcile_required', error_class=type(exc).__name__, error_code=error_code(exc))
                save(pending, record)
                raise

    def reconcile(self, evidence_file):
        with (self.root/'session.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            state = json.loads((self.root/'session.json').read_text())
            if session_busy(state['session_id']):
                raise RuntimeError('SESSION_BUSY')
            pending = self.root/'pending.json'
            record = json.loads(pending.read_text())
            evidence = json.loads(Path(evidence_file).read_text())
            # Explicit coordinator evidence required; timeout is not an unsuccessful operation.
            if not all(evidence.get(k) for k in ('process_stopped', 'session_checked', 'files_checked', 'operations_checked')):
                raise RuntimeError('INCOMPLETE_RECONCILIATION')
            record.update(reconciliation=evidence, current=fingerprint(self.cwd))
            save(self.root/(record['task_id']+'.reconciled.json'), record)
            completed = evidence.get('completed_result')
            if completed is not None:
                if not valid(completed, record['task_id']) or completed['status'] != 'complete':
                    raise RuntimeError('INVALID_RECOVERED_RESULT')
                record.update(status='verified', result=completed, next_step=completed['next_step'])
                save(self.root/(record['task_id']+'.json'), record)
                state.update(last_task=record['task_id'], last_result=str(self.root/(record['task_id']+'.json')), next_step=completed['next_step'])
                save(self.root/'session.json', state)
            elif not evidence.get('safe_to_resume_tool_free'):
                raise RuntimeError('RECOVERY_DECISION_REQUIRED')
            if list((Path.home()/'.claude'/'projects').glob('*/'+state['session_id']+'.jsonl')):
                state['started'] = True
                save(self.root/'session.json', state)
            pending.unlink()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--state-dir', required=True); ap.add_argument('--cwd', required=True)
    ap.add_argument('--task'); ap.add_argument('--prompt-file'); ap.add_argument('--reconcile')
    args = ap.parse_args(); bridge = Bridge(args.state_dir, args.cwd)
    try:
        if args.reconcile:
            bridge.reconcile(args.reconcile)
        else:
            result = bridge.run(args.task, Path(args.prompt_file).read_text())
            print(json.dumps(redact(result['result']), ensure_ascii=False))
    except Exception as exc:
        # Never render arbitrary exception messages carrying tool payloads or secrets.
        print(json.dumps({'status': 'blocked', 'error_class': type(exc).__name__,
                          'reason': error_code(exc)}), flush=True)
        raise SystemExit(1)
