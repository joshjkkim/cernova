# trace-sdk

Python SDK that wraps Claude (Anthropic) messages, captures prompt/code/metrics, and POSTs to your FastAPI `/ingest` endpoint.

## Install (local dev)

```bash
pip install -e sdk/
```

## Usage

```python
import os
from trace_sdk import TraceClient, TraceClientConfig, GenerateOptions

client = TraceClient.create(TraceClientConfig(
    api_key=os.environ["ANTHROPIC_API_KEY"],
    model="claude-sonnet-4",
    max_tokens=4096,                   # Anthropic requires max_tokens (defaults to 4096)
    ingest_url=os.environ.get("INGEST_URL", "http://localhost:8000/ingest"),
))

result = client.generate(
    "Write a Python function that checks if a string is a palindrome.",
    GenerateOptions(step_name="generate_palindrome"),
)
print(result.code)
print(result.trace_id)
```
