import json
import sys
from pathlib import Path
from bridge import Bridge

root = Path(sys.argv[1])
bridge = Bridge(root, Path.cwd())
steps = [
    ('demo-plan', 'Local fixture: batches [2,3]. Sum them; evidence must be exactly ["total=5"]. Next step: deduct an order of3. No tools.', ['total=5']),
    ('demo-clarify', 'Clarification of preceding result: subtract3 from the total you established. Evidence exactly ["after_sale=2"]. Next step: return3.', ['after_sale=2']),
    ('demo-verify', 'Final verification: return3 to previous remainder2. Evidence exactly ["restored=5"]. Explain stock conservation.', ['restored=5']),
]
for task, prompt, evidence in steps:
    result = bridge.run(task, prompt, evidence)
    assert result['status'] == 'verified'
print(json.dumps({'demo':'PASS','exchanges':len(steps),'session_id':json.loads((root/'session.json').read_text())['session_id']}))
