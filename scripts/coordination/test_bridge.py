import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from bridge import Bridge, redact, session_busy


def answer(task='task'):
    return dict(task_id=task, status='complete', summary='verified locally', findings=[], evidence=['once'], next_step='review')


class CoordinationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cwd = self.root/'worktree'
        self.cwd.mkdir()
        subprocess.run(['git','init','-q'],cwd=self.cwd,check=True)
        subprocess.run(['git','-c','user.name=Local Test','-c','user.email=test@example.invalid','commit','--allow-empty','-qm','fixture'],cwd=self.cwd,check=True)
        (self.root/'session.json').write_text(json.dumps({'session_id':'afe4b8fa-ae07-4fc3-b342-7eab477d105a'}))

    def tearDown(self):
        self.tmp.cleanup()

    def test_incomplete_response_clarifies_same_session(self):
        requests = []
        def fake(prompt, state, record):
            requests.append((prompt, state['session_id']))
            return {'summary': 'partial'} if len(requests)==1 else answer()
        result = Bridge(self.root, self.cwd, fake).run('task','inspect', ['once'])
        self.assertEqual(result['status'], 'verified')
        self.assertEqual(len(requests), 2)
        self.assertEqual(requests[0][1], requests[1][1])
        self.assertIn('incomplete', requests[1][0])

    def test_real_child_crash_after_effect_reconciles_without_duplicate(self):
        effect = self.root/'effect.json'
        calls = []
        def crashing(prompt, state, record):
            calls.append(1)
            # Real local child writes one durable receipt then crashes before response delivery.
            proc = subprocess.run([sys.executable, '-c',
                'import pathlib,json,os,sys; p=pathlib.Path(sys.argv[1]); p.write_text(json.dumps({"count":1})); os._exit(17)', str(effect)])
            self.assertEqual(proc.returncode,17)
            raise RuntimeError('PROCESS_ERROR_RECONCILE_REQUIRED')
        bridge = Bridge(self.root,self.cwd,crashing)
        with self.assertRaisesRegex(RuntimeError,'RECONCILE_REQUIRED'):
            bridge.run('task','perform one LOCAL simulation')
        with self.assertRaisesRegex(RuntimeError,'PENDING_RECONCILE_REQUIRED'):
            bridge.run('task','perform one LOCAL simulation')
        self.assertEqual(json.loads(effect.read_text())['count'],1)
        ev=self.root/'evidence.json'
        ev.write_text(json.dumps(dict(process_stopped=True,session_checked=True,files_checked=True,
            operations_checked=True, completed_result=answer())))
        with patch('bridge.session_busy',return_value=False):bridge.reconcile(ev)
        result=bridge.run('task','perform one LOCAL simulation')
        self.assertEqual(result['status'],'verified')
        self.assertEqual(len(calls),1)
        self.assertEqual(json.loads(effect.read_text())['count'],1)

    def test_permissions_never_retried(self):
        calls=[]
        def deny(*args):calls.append(1);raise RuntimeError('PERMISSION_DENIED')
        with self.assertRaisesRegex(RuntimeError,'PERMISSION_DENIED'):
            Bridge(self.root,self.cwd,deny).run('task','inspect')
        self.assertEqual(len(calls),1)

    def test_network_retries_bounded(self):
        calls=[]
        def network(*args):calls.append(1);raise RuntimeError('TRANSIENT_NETWORK')
        with patch('bridge.time.sleep'),patch('bridge.session_busy',return_value=False):
            with self.assertRaisesRegex(RuntimeError,'TRANSIENT_NETWORK'):
                Bridge(self.root,self.cwd,network).run('task','inspect')
        self.assertEqual(len(calls),3)

    def test_busy_and_unknown_completion_fail_closed(self):
        (self.root/'pending.json').write_text('{}')
        with self.assertRaisesRegex(RuntimeError,'PENDING_RECONCILE_REQUIRED'):
            Bridge(self.root,self.cwd,lambda *a:answer()).run('task','inspect')

    def test_logs_redact_credentials(self):
        self.assertNotIn('abc123',redact('password=abc123 cookie=abc123 access_token=abc123'))
        self.assertNotIn('eyJabc.def.ghi',redact('eyJabc.def.ghi'))

    def test_native_cli_process_is_busy(self):
        sid='afe4b8fa-ae07-4fc3-b342-7eab477d105a'
        with patch('bridge.subprocess.check_output',return_value='99999 /Users/local/.local/share/claude/versions/2.1.289 --resume '+sid):
            self.assertTrue(session_busy(sid))

    def test_secret_exception_is_not_persisted(self):
        def fail(*args):raise RuntimeError('password=secret-no-log')
        with self.assertRaises(RuntimeError):Bridge(self.root,self.cwd,fail).run('task','inspect')
        self.assertNotIn('secret-no-log',(self.root/'pending.json').read_text())
        self.assertEqual(redact({'password':'secret-no-log'}),{'password':'[REDACTED]'})

    def test_task_paths_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'INVALID_TASK_ID'):
            Bridge(self.root,self.cwd,lambda *a:answer()).run('../task','inspect')

    def test_node_entrypoint_is_busy(self):
        sid='afe4b8fa-ae07-4fc3-b342-7eab477d105a'
        with patch('bridge.subprocess.check_output',return_value='99999 /opt/bin/node --no-warnings /opt/lib/claude-code/cli.js --resume '+sid):
            self.assertTrue(session_busy(sid))

    def test_review_words_are_not_cli_errors(self):
        state=json.loads((self.root/'session.json').read_text())
        result=answer();result['summary']='permission denied, connection reset, etimedout are discussed here'
        proc=MagicMock();proc.pid=99999;proc.returncode=0
        proc.communicate.return_value=(json.dumps({'session_id':state['session_id'],'structured_output':result,'result':result['summary'],'is_error':False}), '')
        with patch('bridge.subprocess.Popen',return_value=proc),patch('bridge.session_busy',return_value=False):
            self.assertEqual(Bridge(self.root,self.cwd).cli('inspect',state,{'task_id':'task'}),result)
            proc.communicate.return_value=(json.dumps({'session_id':state['session_id'],'structured_output':result,'permission_denials':[{'tool_name':'Write'}]}), '')
            with self.assertRaisesRegex(RuntimeError,'PERMISSION_DENIED'):
                Bridge(self.root,self.cwd).cli('inspect',state,{'task_id':'task'})

    def test_existing_receipt_is_independently_rechecked(self):
        b=Bridge(self.root,self.cwd,lambda *a:answer())
        b.run('task','inspect')
        with self.assertRaisesRegex(RuntimeError,'INDEPENDENT_CHECK_FAILED'):b.run('task','inspect',['wrong'])
        self.assertEqual(b.run('task','inspect',['once'])['status'],'verified')

    def test_non_git_fingerprint_fails_closed(self):
        with patch('bridge.subprocess.check_output',side_effect=subprocess.CalledProcessError(128,'git')):
            with self.assertRaisesRegex(RuntimeError,'GIT_FINGERPRINT_UNAVAILABLE'):
                Bridge(self.root,self.root,lambda *a:answer()).run('task','inspect')

    def test_completed_task_receipt_skips_second_dispatch(self):
        calls=[]
        def fake(*a):calls.append(1);return answer()
        b=Bridge(self.root,self.cwd,fake)
        b.run('task','inspect',['once']);b.run('task','inspect',['once'])
        self.assertEqual(len(calls),1)
        with self.assertRaisesRegex(RuntimeError,'TASK_ID_REUSED'):
            b.run('task','different')

if __name__=='__main__':unittest.main()
