"""Run the local Buggy Maps preview with the included Miami-Dade data."""
import argparse
from contextlib import ExitStack
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import subprocess
import tempfile
import webbrowser
from zipfile import ZipFile

BASE = "1e59168aee46ed867bc988107d922e534384dc50"
ROOT = Path(__file__).resolve().parent
CHECKS = (
    "home-choice", "place-discovery", "property-search", "public-sharing",
    "trip-location", "commute-workspace", "parent-booking", "trip-road-network",
    "school-directory", "buggy-school-links", "agent-schools",
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Authorized Sites Git checkout containing v14")
    parser.add_argument("--check", action="store_true", help="Run the Node verification scripts and exit")
    parser.add_argument("--no-browser", action="store_true", help="Print the local URL without opening a tab")
    args = parser.parse_args()

    with ExitStack() as resources:
        app = ROOT
        if args.source:
            app = Path(resources.enter_context(tempfile.TemporaryDirectory(prefix="buggy-map-")))
            archive = app / "v14.zip"
            subprocess.run(["git", "-C", str(args.source), "-c", "core.autocrlf=false", "archive", "--format=zip", "-0",
                            "-o", str(archive), BASE, "dist"], check=True)
            with ZipFile(archive) as snapshot:
                snapshot.extractall(app)
            shutil.copytree(ROOT / "dist", app / "dist", dirs_exist_ok=True)
            shutil.copytree(ROOT / "scripts", app / "scripts")
        if not (app / "dist/buggy/data/index.json").is_file():
            parser.error("The school and property snapshot is missing. Restore the dist directory from Git or extract the entire bundle.")
        if args.check:
            for name in CHECKS:
                subprocess.run(["node", f"scripts/verify-{name}.mjs"], cwd=app, check=True)
            print(f"Passed all {len(CHECKS)} verification scripts.")
            return
        handler = partial(SimpleHTTPRequestHandler, directory=str(app / "dist"))
        server = resources.enter_context(ThreadingHTTPServer(("127.0.0.1", 0), handler))
        url = f"http://127.0.0.1:{server.server_port}/buggy/"
        print(f"Buggy Maps is ready at {url}\nPress Ctrl+C to stop.", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
