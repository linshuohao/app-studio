INSTRUCTIONS = """Read the current request, business history and any reference candidate.
When a reference is supplied, interpret the message as a change to that form. If it already demonstrably satisfies the request, answer directly and identify the relevant configuration.
The newest explicit user correction takes precedence. Ask only for missing decisions
that affect business behavior. If the request can proceed, record requirements and
assumptions for authoring. Capability availability will be determined later from
the target catalog. Answer information-only questions, and report out-of-scope
requests as blocked. Use the user's language."""


DOCUMENT_INSTRUCTIONS = """When previous_standard is supplied, update that verified record with the new message. Otherwise read the entire requirements_document.markdown before deciding.
For a creation or revision request set decision to "create", including when the user requests a business clarification before proceeding. Conflicting business requirements must produce a sourced ask_user issue and an actionable choice, even when the user explicitly says “先问我”. Put all business facts,
assumptions and unresolved questions in standard alone. A confirmed answer replaces
the corresponding ask_user issue. Field rule_ids may reference validation, reaction,
host or view requirements. Before returning, resolve each rule_id against the final
requirement list: omit links to fields, data groups, the field itself and missing IDs.
Use [] when no separate rule applies. Return standard even when you need clarification. Normalize the business requirements,
preserve exceptions and distinguish stated scenarios from suggested tests. Give every
requirement an R-number and one or more short exact quotes from sources.
Use the supplied source_ids: document is the Markdown, message is the current user message, and each user history row carries its exact source_id (turn:N). For older inputs without source_id use history:N from the supplied source_ids list. Do not insert unsupported business decisions.
Represent each collected field by one requirement of kind field (reserve data for group/whole-form structure) with its field definition:
group (including per-member scope), name, meaning, business value type, presence,
known label/value pairs or dynamic option source, local validation, and related rule IDs.
Keep unknown business codes null; never invent an enum value.
Record group cardinality and shared conditions, reactions and Host interactions as
separate sourced requirements. Link them by ID. Field sources cover its attributes.
Missing optional limits, defaults, formats and copy stay unspecified or empty.
Use confirmed answers before raising issues. For a consequential business choice
use ask_user, with detail phrased as an actionable user question. For a missing
capability contract use look_up_source with the precise evidence compose must seek.
Link each issue to affected requirements or give exact source excerpts for form-wide gaps.
Missing runtime values, credentials, Host implementations and production service bindings are deployment dependencies. Record their required behavior and known contracts; never ask the user to supply the runtime values or bindings to continue authoring.
Only ask_user blocks the handoff. Group outstanding business questions for clarification.
Do not decide protocol or component choices here."""
