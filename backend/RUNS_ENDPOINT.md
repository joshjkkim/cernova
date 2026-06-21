# GET /runs/{run_id} Endpoint

View complete workflow executions with aggregated metrics.

## Endpoint

```
GET /runs/{run_id}
```

Returns all traces for a workflow run along with aggregated metrics.

## Response

```json
{
  "run_id": "test-workflow-1782001279939",
  "project_id": null,
  "steps": [
    {
      "id": "35",
      "step_name": "step1-classify",
      "created_at": "2026-06-21T00:20:25.850629Z",
      "model": "claude-haiku-4-5-20251001",
      "input_tokens": 22,
      "output_tokens": 16,
      "total_tokens": 38,
      "latency_ms": 844,
      "cost": 0.000082,
      "status_success": true,
      "output_code": "**support**\n\n\"I need help\" is a general request...",
      "run_id": "test-workflow-1782001279939",
      "project_id": null
    },
    // ... more steps
  ],
  "metrics": {
    "total_cost": 0.000496,
    "total_tokens": 224,
    "total_input_tokens": 125,
    "total_output_tokens": 99,
    "total_reasoning_tokens": 0,
    "total_latency_ms": 2804,
    "error_count": 0,
    "success_count": 3,
    "step_count": 3,
    "duration_ms": 1906
  },
  "created_at": "2026-06-21T00:20:25.850629Z",
  "completed_at": "2026-06-21T00:20:27.538625Z"
}
```

## Metrics Explained

| Field | Description |
|-------|-------------|
| `total_cost` | Sum of all step costs (USD) |
| `total_tokens` | Sum of all tokens consumed |
| `total_input_tokens` | Sum of input tokens |
| `total_output_tokens` | Sum of output tokens |
| `total_reasoning_tokens` | Sum of reasoning tokens (for extended thinking) |
| `total_latency_ms` | Sum of all step latencies (wall-clock time) |
| `error_count` | Number of failed steps |
| `success_count` | Number of successful steps |
| `step_count` | Total steps |
| `duration_ms` | Wall-clock time from first step to last step |

## Examples

### Get workflow in curl

```bash
curl http://localhost:8000/runs/test-workflow-123
```

### Get workflow in JavaScript

```typescript
const response = await fetch('http://localhost:8000/runs/my-workflow-id');
const workflow = await response.json();

console.log(`Total cost: $${workflow.metrics.total_cost}`);
console.log(`Total tokens: ${workflow.metrics.total_tokens}`);
console.log(`Steps: ${workflow.metrics.step_count}`);
console.log(`Duration: ${workflow.metrics.duration_ms}ms`);
```

### Python

```python
import requests

response = requests.get('http://localhost:8000/runs/my-workflow-id')
workflow = response.json()

print(f"Total cost: ${workflow['metrics']['total_cost']}")
print(f"Total tokens: {workflow['metrics']['total_tokens']}")
print(f"Steps: {workflow['metrics']['step_count']}")
```

## Error Cases

- **404 Not Found** — Run ID doesn't exist or has no traces
- **500 Internal Server Error** — Backend error (check logs)

## Use Cases

1. **Workflow monitoring** — Check total cost and tokens for a workflow
2. **Performance analysis** — Compare duration vs step count
3. **Budget tracking** — Sum costs across all workflows
4. **Error detection** — Identify which workflows failed
5. **Workflow templates** — Save good workflows by run_id and reference them

## Testing

```bash
# Run test to see it in action
npm run test:workflow-endpoint
```
