## 5. Verify As A Consumer

Metadata can be well-formed and still not resolve. Run the tools built for this, against the tarball
you already produced:

```bash
npx --yes publint run <tarball>
npx --yes @arethetypeswrong/cli --format table <tarball>
```

`attw` is the check that catches a subpath export with no types, a `require` condition with no CJS
declaration, and ESM declarations masquerading as CJS. It reports **per entry point**, which is
exactly the blind spot in step 1. If you run only one verification tool, run this one.

**An `attw` failure in a mode the package supports is a failure.** Finding _a_ declaration file is
not the same as that file having the right module semantics: a successful path-only probe does not
overrule `export =` missing from a CJS entry, or an ESM declaration served to `require`. Fix it, or
report it as an unresolved failure in your summary. Never drop it silently.
