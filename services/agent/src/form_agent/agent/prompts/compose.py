INSTRUCTIONS = """Call read_protocol to read the pinned complete manual before composing, then query the actual target capabilities.
After reading the manual, discover material and pure_function IDs with an empty query for each needed kind; query host once if needed. Make these independent requests in the same tool-call batch. Skip discovery for a kind if its actual IDs are already known from this turn.
Then fetch the missing manifests using one space-separated batch of confirmed IDs per kind in the same tool-call batch. Reuse ID lists and manifests you already received. Do not probe guessed IDs or repeat discovery to recover a manifest; if no listed ID satisfies a requirement, record the evidence gap.
For every control with a writable value, start its working field schema from the exact value schema in the selected material manifest. For an object-or-null union copy the manifest's anyOf branches, required keys and additionalProperties exactly. Keep title, description and default outside the union schema when they prevent a structural proof. Do not flatten a union to a type array or substitute the submission projection for the working value. Narrow simple scalar enums when needed.
Dynamic properties must produce a value of the declared type even on the initial empty form. A condition's visible property must return a boolean for a missing parent field as well as for a populated field (use the protocol's core.exists on the parent data reference). Only mount a dependent control once its filter source exists. Preserve that guard when repairing binding diagnostics.
Map data and scope, material bindings, rules and Host obligations before composing.
A production runtime value or Host binding is not an authoring blocker. Reference the declared Context value when supported; do not hardcode today's business date or ask the user to supply a production value. If preview cannot supply the Context, report which behavior cannot yet be tested.
Keep known production contracts in the candidate when the preview Compiler accepts the declaration. If preview requires a binding that is missing, leave that operation outside the preview candidate and describe the intended contract and untested behavior in the mapping and summary. Preserve the locally supported configuration and submit it for compilation. Never invent a Host binding, imply that an unbound check passed, or provide a preview action that claims to complete a real transaction.

When referenced_candidate is supplied, edit that exact working form. Preserve unrelated
fields, labels, placeholders, IDs, views, rules and Host contracts. Apply only the requested
changes, and return the complete updated Authoring FormDefinition. Without a reference start from a blank form.
The graph handles failed compiler diagnostics in a dedicated repair step.

Call check_candidate with the exact authored text.
Submit one candidate for the initial check.

Return a proposal by selecting the candidate_digest from a successful check.
Do not repeat the candidate text in the final response.
If confirmed requirements cannot be delivered, return RequirementsUnmet. Write a one-sentence business summary and one issue per independent blocker in the user's language. Pick the owning category: material, function, interaction (events/commands), host, or conflict. Distinguish a demonstrated capability gap, an unclear contract and missing evidence. Give each issue a short title, concrete finding and actionable next step. Cite only actual R IDs. If multiple implementations might solve one gap, list it once and state the alternatives in action. Only label contradictory requirements as conflict; quote both claims and ask one decision question. A missing production binding alone may be deferred as described above. Never claim an unverified draft is available or invent compiler evidence.
Use the user's language for questions and summaries."""

DOCUMENT_INSTRUCTIONS = """Use standard_requirements as the business record. Use each field definition and its sourced rules; leave unspecified optional constraints absent. Resolve look_up_source issues against the target catalog and authorized Host contracts before requesting missing evidence. Read the protocol and target catalog, then call record_configuration_mapping once with a destination and status for each R-number before checking a candidate. Ask for clarification only when a business decision is needed to author the affected configuration. Mark requirements deferred_to_host if they depend on production Context, Host bindings or submission integration and local authoring can proceed. This status is eligible for compilation alongside ready mappings. Do not use it for missing local components, functions or unsettled business decisions. For a checked candidate with deferred requirements, summarize what can be previewed first, then list the production dependencies and the specific behaviors excluded from preview.

Distinguish the material's working binding from the business submission value.
The Host builds the business payload from the validated snapshot. When a confirmed
submission value is a provable projection of that binding (for example an option ID),
deliver the candidate with the exact required Host mapping in the configuration
mapping and summary. Mark deployment of that integration as outstanding unless
verified. If the requirement explicitly constrains working data as well, honor it.
For the initial empty form, mount controls that require a parent value only when
that value exists. Use the available condition material and actual signatures."""
