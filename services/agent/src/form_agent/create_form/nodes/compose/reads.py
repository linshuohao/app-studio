from dataclasses import dataclass, field

from pydantic import JsonValue


@dataclass
class AuthoringReads:
    """Protocol and catalog evidence for one authoring invocation."""

    protocol_read: bool = False
    protocol_result: JsonValue = None
    completed_queries: set[tuple[str, str]] = field(default_factory=set)
    catalog_results: dict[tuple[str, str], str] = field(
        default_factory=dict[tuple[str, str], str]
    )
