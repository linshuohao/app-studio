"""Serve the generated knowledge reader on loopback, with optional rebuild."""
from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]


class ReaderHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--build", action="store_true", help="Rebuild before serving")
    args = parser.parse_args()
    if args.build:
        subprocess.run([sys.executable, str(ROOT / "tools/docs/build_docs.py")], check=True)
    if not (ROOT / "docs/reading/assets/knowledge-index.js").exists():
        parser.exit(1, "Run tools/docs/build_docs.py before serving.\n")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), partial(ReaderHandler, directory=str(ROOT)))
    except OSError as error:
        parser.exit(1, f"Cannot bind local port {args.port}: {error}. Choose another --port.\n")
    print(f"Architecture reader: http://127.0.0.1:{args.port}/docs/reading/architecture.html", flush=True)
    print("Loopback only. Press Ctrl+C to stop.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
