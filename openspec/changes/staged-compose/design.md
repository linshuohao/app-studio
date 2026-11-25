# Implementation

Use a Platform-internal check against the same compiler resource model and schema evaluator. The preparation phase records the checked Schema and requirement allocation. View, validation, and reaction steps own disjoint Authoring Definition paths and read scoped requirements. The Agent journal retains model and tool results, while Platform continues to own delivered drafts. Compiler diagnostics can direct a bounded repair to one owner. Diagnostics with unclear ownership require an explicit failure disposition.

## Paired model evaluation

The final offline evaluation ran one fresh trial per workflow on each of five existing PRDs using `local-chatgpt:gpt-6.2-sol` and two concurrent cases per side. The two reports matched on input digest, scorer, protocol, workspace revision and target. Both remote-city trials passed their Runtime assertions. The old workflow's country-change candidate compiled, but the Runtime assertions failed. The browser used Platform's actual catalog, while both offline paths used the same fixture catalog.

| Metric                                  | Old Compose | Staged Compose |
| --------------------------------------- | ----------: | -------------: |
| Business success                        |         4/5 |            5/5 |
| First compiler check passed             |         3/5 |            5/5 |
| Median end-to-end time                  |     157.6 s |        130.6 s |
| Model calls                             |          46 |             37 |
| Total tokens, with usage for every call |   1,304,297 |        784,321 |

An earlier matched run before the browser-driven fixes returned 3/5 and 5/5, with median times of 201.8 and 145.6 seconds. The provider omitted usage for one abandoned understanding stream in the earlier old clarification case. Its four fully reported pairs used 965,216 and 515,668 tokens. The runs show sample-level differences and variation between trials.

A later trial represented country codes as a `oneOf` of uniquely titled string constants. Schema examples passed, but the Compiler could not prove the select binding. Schema authoring now asks for a string `enum` for fixed string choices and returns that equivalent `oneOf` form for repair before the Schema receipt is issued. The travel regression exercises the rejected draft, the corrected Schema, full-form compilation and both Runtime assertions. A fresh single-case model run passed with Staged Compose in 114.9 seconds after the fix.

## Studio browser acceptance

The isolated Chrome run used `local-chatgpt:gpt-6.2-sol` to create a fresh remote-city draft from the complete PRD in 139.5 seconds, measured from opening Studio. The authenticated catalog provides documentation for the exact installed material version when the Agent reads its manifest. View generation guards optional filter sources before mounting dependent controls. Starting with empty data, the browser search selected Shanghai, cleared the value when changing country, and selected Tokyo using Studio's simulated Host. The test also reopened the renamed draft, reattached the original conversation, kept a conflicting manual placeholder edit, and checked that the saved version had the exact digest of the approved preview.
