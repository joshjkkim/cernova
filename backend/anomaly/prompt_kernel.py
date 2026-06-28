"""Extract the stable system-prompt kernel from ingest prompt JSON.

Shared by fingerprinter (step identity) and behavior_vector (prompt_embed).
No backend imports — safe for the standalone anomaly package.
"""

from __future__ import annotations

import json

KERNEL_MAX_CHARS = 500
FALLBACK_MAX_CHARS = 200


def extract_system_prompt(prompt_json: str) -> str:
    """Pull the stable instruction part out of the prompt JSON.

    Supports two formats:
      TS SDK:  {"system": "...", "messages": [...]}
      LangChain/Python: {"messages": [{"role": "system", ...}, ...]}
    The system prompt is the stable identity of a step; user messages vary per call.
    """
    try:
        obj = json.loads(prompt_json)
        if isinstance(obj, dict):
            if obj.get("system"):
                return str(obj["system"])[:KERNEL_MAX_CHARS]
            msgs = obj.get("messages", [])
            for msg in msgs:
                if isinstance(msg, dict) and msg.get("role") == "system":
                    content = msg.get("content", "")
                    text = content if isinstance(content, str) else str(content)
                    return text[:KERNEL_MAX_CHARS]
            for msg in msgs:
                if isinstance(msg, dict) and msg.get("role") == "user":
                    content = msg.get("content", "")
                    text = content if isinstance(content, str) else str(content)
                    return text[:FALLBACK_MAX_CHARS]
    except (ValueError, TypeError):
        pass
    return prompt_json[:FALLBACK_MAX_CHARS]
