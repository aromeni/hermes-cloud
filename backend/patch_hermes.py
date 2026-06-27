import pathlib

p = pathlib.Path('/usr/local/lib/python3.12/site-packages/hermes/code_agent.py')
src = p.read_text()
old = 'env = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "CLAUDE_API_KEY")}'
new = 'env = dict(os.environ)'
patched = src.replace(old, new)
if patched == src:
    raise RuntimeError("Patch target not found in code_agent.py — hermes source may have changed")
p.write_text(patched)
print(f"Patched {p}: ANTHROPIC_API_KEY now passed through to claude subprocess")
