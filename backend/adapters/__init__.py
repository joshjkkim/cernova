"""Wire-format adapters.

One module per ingest source. Each adapter owns every quirk of its format and
outputs a CanonicalTrace — the only shape the rest of the pipeline consumes.

Adding a source (OTel, Langfuse import, …) means adding a module here, not
touching the engine.
"""

from adapters.cernova import to_canonical
from adapters.otel import otlp_json_to_canonical
from adapters.langfuse import observation_to_canonical, observations_to_canonical

__all__ = [
    "to_canonical",
    "otlp_json_to_canonical",
    "observation_to_canonical",
    "observations_to_canonical",
]
