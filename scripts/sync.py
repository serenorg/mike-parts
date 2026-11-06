#!/usr/bin/env python3
# ABOUTME: Copies each part in mike-parts.yaml again when upstream's newest commit changes it, then rebuilds dist/.
# ABOUTME: Opens one pull request on branch sync/mike-parts, or updates the open one; it never merges.
import argparse
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LIST = ROOT / "mike-parts.yaml"
BRANCH = "sync/mike-parts"
BASE = "main"
TITLE = "chore: update mike's parts"


def run(*args, cwd=ROOT, capture=True, check=True):
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=capture)
    if check and result.returncode != 0:
        sys.exit(f"{' '.join(args)} failed:\n{result.stderr}")
    return result.stdout.strip() if capture else ""


def changed_paths(clone, old, new, paths):
    return run("git", "diff", "--name-only", old, new, "--", *paths, cwd=clone).splitlines()


def copy_part(clone, commit, folder, path):
    target = ROOT / folder / path
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()
    if not run("git", "ls-tree", commit, "--", path, cwd=clone):
        return False
    archive = subprocess.run(["git", "archive", commit, "--", path], cwd=clone, capture_output=True, check=True)
    (ROOT / folder).mkdir(parents=True, exist_ok=True)
    subprocess.run(["tar", "-x", "-C", str(ROOT / folder)], input=archive.stdout, check=True)
    return True


def set_commit(text, repository, old, new):
    # Rewrite only this part's commit line, so the list's comments stay as they are.
    lines = text.split("\n")
    in_part = False
    for i, line in enumerate(lines):
        if line.strip().startswith("- repository:"):
            in_part = line.split(":", 1)[1].strip() == repository
        elif in_part and line.strip() == f"commit: {old}":
            lines[i] = line.replace(old, new)
            return "\n".join(lines)
    sys.exit(f"could not find commit {old} for {repository} in {LIST.name}")


def check_parts(work):
    """Copy every changed part; return (summary lines, warnings)."""
    parts = yaml.safe_load(LIST.read_text())["parts"]
    text = LIST.read_text()
    summary, warnings = [], []
    for part in parts:
        repository, old, folder, paths = part["repository"], part["commit"], part["folder"], part["paths"]
        clone = work / folder
        run("git", "clone", "--quiet", "--filter=blob:none", "--no-checkout",
            f"https://github.com/{repository}.git", str(clone))
        new = run("git", "rev-parse", "HEAD", cwd=clone)
        print(f"{repository}: listed {old[:7]}, upstream {new[:7]}")
        if new == old:
            continue
        files = changed_paths(clone, old, new, paths)
        sources = [shim["copies"].rsplit(" from ", 1)[1] for shim in part.get("shims", [])]
        shim_files = changed_paths(clone, old, new, sources) if sources else []
        if shim_files:
            warnings.append(f"- `{repository}` changed {', '.join(f'`{f}`' for f in shim_files)}, which Seren's "
                            f"stand-ins in `{folder}/` copy from. Compare them by hand before merging.")
        if not files:
            continue
        gone = [p for p in paths if not copy_part(clone, new, folder, p)]
        for p in gone:
            warnings.append(f"- `{repository}` no longer has `{p}`; its copy in `{folder}/` was removed.")
        text = set_commit(text, repository, old, new)
        listed = "\n".join(f"  - `{folder}/{f}`" for f in files)
        summary.append(f"- **{repository}** `{old[:7]}` to `{new[:7]}`: "
                       f"https://github.com/{repository}/compare/{old}...{new}\n{listed}")
    LIST.write_text(text)
    return summary, warnings


def open_or_update_pull_request(body):
    run("git", "checkout", "-B", BRANCH)
    run("git", "add", "-A", "mike-parts.yaml", "dist")
    run("git", "add", "-A", *[p["folder"] for p in yaml.safe_load(LIST.read_text())["parts"]])
    run("git", "-c", "user.name=github-actions[bot]",
        "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com",
        "commit", "--quiet", "-m", TITLE)
    if run("git", "ls-remote", "--heads", "origin", BRANCH):
        run("git", "fetch", "--quiet", "origin", BRANCH)
        same = run("git", "rev-parse", "HEAD^{tree}") == run("git", "rev-parse", "FETCH_HEAD^{tree}")
    else:
        same = False
    if not same:
        run("git", "push", "--quiet", "--force", "origin", f"HEAD:refs/heads/{BRANCH}")
    number = run("gh", "pr", "list", "--head", BRANCH, "--base", BASE, "--state", "open",
                 "--json", "number", "--jq", ".[0].number")
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(body)
    try:
        if number:
            run("gh", "pr", "edit", number, "--body-file", f.name)
            print(f"updated pull request #{number}")
        else:
            print(run("gh", "pr", "create", "--base", BASE, "--head", BRANCH, "--title", TITLE, "--body-file", f.name))
    finally:
        os.unlink(f.name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="copy and rebuild, print the pull request, but commit, push and open nothing")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        summary, warnings = check_parts(Path(tmp))
    if not summary and not warnings:
        print("every part is current")
        return
    if not summary:
        print("\n".join(warnings))
        print("no copied part changed; nothing to open")
        return
    run("scripts/build.sh")
    body = ("Upstream changed these parts of Mike. This pull request copies them, updates their commits in "
            "`mike-parts.yaml` and rebuilds `dist/`. A person reviews and merges it; nothing reaches an Employee "
            "until then.\n\n" + "\n".join(summary) + "\n")
    if warnings:
        body += "\n**Check by hand**\n\n" + "\n".join(warnings) + "\n"
    if args.dry_run:
        print(body)
        print(run("git", "status", "--short"))
        return
    open_or_update_pull_request(body)


if __name__ == "__main__":
    main()
