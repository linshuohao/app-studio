## 3. Fix diagnostics by modeling types

Prefer these, roughly in order:

- Add precise annotations: structural interfaces/type aliases, recursive data types, discriminated unions, literal types.
- Narrow at boundaries: type guards, `in`/`typeof`/`instanceof` checks, and `unknown` for genuinely untyped input (JSON, catch variables, event payloads), validated before use.
- Preserve generic relationships. Keep type parameters, mapped, conditional, and indexed-access types connected to their inputs rather than collapsing them to `object`, `Function`, `Record<string, any>`, or `any`. Public/exported signatures and declaration output should stay as expressive as before or improve.
- Handle `null`/`undefined` with real checks, defaults that preserve current behavior, optional chaining, or by fixing the declared type. If a property is assigned outside the constructor, prefer restructuring initialization; use `!` only when an invariant is guaranteed and documented.
- Use `this` parameters, overloads, or generics for callback/receiver typing problems.

Forbidden (in production code and in the project's normal tests):

- New `any` (explicit, `as any`, `Record<string, any>`, `any[]`, `Function`), double assertions (`as unknown as T`), unjustified `as T` casts, and broad non-null assertions (`!`).
- `// @ts-ignore`, `// @ts-nocheck`, and `// @ts-expect-error` used to hide diagnostics. Same for `eslint-disable` of type-safety rules.
- Changing runtime semantics to satisfy types (reordering initialization, altering defaults, adding or dropping branches, changing exports/module format). A type fix should not change emitted JavaScript behavior; if a real bug is exposed, make the smallest correct fix, call it out, and add or run a test for it.

If a diagnostic truly cannot be modeled (e.g. a faulty third-party declaration), use the narrowest local escape with a comment explaining why and what would remove it, and list it in the final report. Never use that as the default.

Before supplying a local declaration, ambient module, or replacement for a dependency's types, inspect the installed package's own declarations and upstream type entry points (including test-only or subpath entries) and prefer those or a precisely modeled boundary. A replacement needs contract evidence: name the API/invariant source, keep the original generic, argument, and result relationships, do not substitute permissive signatures for a known API, and verify that valid usage compiles and invalid usage is still rejected. A removal comment alone is not enough. Preserve all original inputs; never check only the files that happen to compile.

### Legitimate exceptions vs. escapes

- `@ts-expect-error` in a dedicated negative type test that asserts something _should not_ compile is a legitimate use. Keep such checks in test/type-test files, with a one-line reason, and report them as intentional rather than as strictness workarounds.
- Pre-existing `any`/casts that already existed before your change are not new regressions, but do not copy them into new code, and prefer tightening them when you edit those lines anyway.
- Report counts for both so a reviewer can tell intentional or pre-existing items from newly introduced escapes.
