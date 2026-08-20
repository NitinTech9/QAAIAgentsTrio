#!/usr/bin/env bash
# Install the QA agents framework into an existing test repo — without clobbering it.
#
#   ./install.sh --target /path/to/your-test-repo [--dry-run] [--force]
#
# Guarantees:
#   * Never overwrites an existing file unless --force (and then it backs it up first).
#   * Never replaces the target's CLAUDE.md — appends/refreshes one marked block.
#   * Never writes the target's .claude/settings.json — emits a suggested merge instead.
#   * Reports slash-command / skill name collisions before they surprise you.
#   * Records a manifest so the next version can be upgraded instead of re-merged by hand.
#
# bash 3.2 compatible (macOS default shell): no mapfile, no associative arrays.

set -euo pipefail

FRAMEWORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(cat "$FRAMEWORK_DIR/VERSION" 2>/dev/null || echo "0.0.0-dev")"

TARGET=""
DRY_RUN=0
FORCE=0

MARK_BEGIN="<!-- BEGIN qa-ai-agents (managed by install.sh — edits here are overwritten) -->"
MARK_END="<!-- END qa-ai-agents -->"

# Directories copied wholesale. Every subdirectory of .claude/ is framework-owned: users are
# never told to hand-edit anything in one, so a future upgrade can replace them safely. This is
# discovered rather than listed, so adding a new payload directory (guides/, stacks/, hooks/…)
# cannot silently ship an install that is missing files the commands reference.
# User-owned state is always a FILE at .claude/ top level (project-config.json, settings.json),
# never a directory — see PAYLOAD_ONCE and the settings handling below.
PAYLOAD_DIRS=""
for _d in "$FRAMEWORK_DIR"/.claude/*/; do
  [ -d "$_d" ] || continue
  _name="$(basename "$_d")"
  case "$_name" in
    .*) continue ;;  # skip dotted dirs (.qa-backup-*, editor cruft)
  esac
  PAYLOAD_DIRS="$PAYLOAD_DIRS .claude/$_name"
done
# The shared spec-gate runner (pre-commit hook, /validate-spec, and CI all invoke it).
PAYLOAD_DIRS="$PAYLOAD_DIRS scripts/gates"
# Single files copied only when absent (user-owned after first install).
PAYLOAD_ONCE=".claude/project-config.json"
# Docs and examples copied wholesale (framework-owned, safe to refresh on upgrade).
PAYLOAD_DOCS="AI-AUTOMATION-GUIDE.md HOW-TO-ADAPT.md SETUP.md ci/qa-pr-gate.example.yml .claude/project-config.local.example.json .claude/settings.local.example.json"

CONFLICTS=""
NAME_COLLISIONS=""
PLANNED=""
SKIPPED_EXISTING=""
# Every payload file, whatever its classification. This is the manifest of files the framework
# owns in the target — an already-identical file is still an installed file, so a rerun must not
# shrink the manifest.
ALL_FILES=""

die() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
note() { printf '  %s\n' "$1"; }

usage() {
  sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET="${2:-}"; shift 2 ;;
    --target=*) TARGET="${1#*=}"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --force) FORCE=1; shift ;;
    -h|--help) usage 0 ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
done

[ -n "$TARGET" ] || usage 1
[ -d "$TARGET" ] || die "target directory does not exist: $TARGET"
TARGET="$(cd "$TARGET" && pwd)"
[ "$TARGET" != "$FRAMEWORK_DIR" ] || die "target is the framework repo itself — pick your test repo"

if [ ! -d "$TARGET/.git" ]; then
  printf '\033[33mwarning:\033[0m %s is not a git repo — you will not be able to review or revert this install.\n' "$TARGET"
fi

echo "QA AI Agents v$VERSION → $TARGET"
[ "$DRY_RUN" -eq 1 ] && echo "(dry run — nothing will be written)"
echo

# ---------------------------------------------------------------------------
# Pass 1: classify every payload file. Writes nothing.
# ---------------------------------------------------------------------------
classify() {
  # $1 = path relative to framework root
  local rel="$1" src="$FRAMEWORK_DIR/$1" dst="$TARGET/$1"
  ALL_FILES="$ALL_FILES$rel"$'\n'
  if [ ! -e "$dst" ]; then
    PLANNED="$PLANNED$rel"$'\n'
  elif cmp -s "$src" "$dst"; then
    :  # identical — already installed at this version, nothing to do
  else
    CONFLICTS="$CONFLICTS$rel"$'\n'
  fi
}

for dir in $PAYLOAD_DIRS; do
  [ -d "$FRAMEWORK_DIR/$dir" ] || continue
  while IFS= read -r f; do
    [ -n "$f" ] && classify "${f#$FRAMEWORK_DIR/}"
  done < <(find "$FRAMEWORK_DIR/$dir" -type f)
done

for f in $PAYLOAD_DOCS; do
  [ -e "$FRAMEWORK_DIR/$f" ] && classify "$f"
done

for f in $PAYLOAD_ONCE; do
  [ -e "$FRAMEWORK_DIR/$f" ] || continue
  if [ -e "$TARGET/$f" ]; then
    SKIPPED_EXISTING="$SKIPPED_EXISTING$f"$'\n'
  else
    PLANNED="$PLANNED$f"$'\n'
  fi
done

# Slash-command / skill name collisions with whatever the target already has.
check_name_collisions() {
  local ours theirs base
  while IFS= read -r ours; do
    [ -n "$ours" ] || continue
    base="$(basename "$ours" .md)"
    for theirs in "$TARGET/.claude/commands/$base.md" "$TARGET/.claude/skills/$base/SKILL.md"; do
      if [ -e "$theirs" ] && ! cmp -s "$ours" "$theirs"; then
        NAME_COLLISIONS="$NAME_COLLISIONS/$base"$'\n'
      fi
    done
  done < <(find "$FRAMEWORK_DIR/.claude/commands" -name '*.md' -type f 2>/dev/null)

  while IFS= read -r ours; do
    [ -n "$ours" ] || continue
    base="$(basename "$(dirname "$ours")")"
    for theirs in "$TARGET/.claude/commands/$base.md" "$TARGET/.claude/skills/$base/SKILL.md"; do
      if [ -e "$theirs" ] && ! cmp -s "$ours" "$theirs"; then
        NAME_COLLISIONS="$NAME_COLLISIONS/$base"$'\n'
      fi
    done
  done < <(find "$FRAMEWORK_DIR/.claude/skills" -name 'SKILL.md' -type f 2>/dev/null)

  NAME_COLLISIONS="$(printf '%s' "$NAME_COLLISIONS" | sort -u)"
}
check_name_collisions

# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
n_planned=$(printf '%s' "$PLANNED" | grep -c . || true)
n_conflict=$(printf '%s' "$CONFLICTS" | grep -c . || true)

echo "new files:        $n_planned"
echo "already present:  $(printf '%s' "$SKIPPED_EXISTING" | grep -c . || true) (left untouched)"
echo "conflicts:        $n_conflict"

if [ "$n_conflict" -gt 0 ]; then
  echo
  echo "These target files differ from the framework version:"
  printf '%s' "$CONFLICTS" | sed 's/^/  ~ /'
  if [ "$FORCE" -eq 1 ]; then
    echo "  --force: each will be backed up to .claude/.qa-backup-<timestamp>/ then replaced."
  else
    echo "  Not overwriting. Each will be written alongside as <file>.qa-incoming for you to diff:"
    echo "    diff <file> <file>.qa-incoming"
    echo "  Re-run with --force to replace them (originals are backed up)."
  fi
fi

if [ -n "$NAME_COLLISIONS" ]; then
  echo
  printf '\033[33mslash-command name collisions:\033[0m your repo already defines these\n'
  printf '%s\n' "$NAME_COLLISIONS" | sed 's/^/  /'
  echo "  Both definitions will be visible to Claude Code and it may pick either one."
  echo "  Rename one side before using the pipeline."
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo
  echo "Dry run complete. Re-run without --dry-run to install."
  exit 0
fi

# ---------------------------------------------------------------------------
# Pass 2: write
# ---------------------------------------------------------------------------
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$TARGET/.claude/.qa-backup-$STAMP"

echo
install_file() {
  local rel="$1" src="$FRAMEWORK_DIR/$1" dst="$TARGET/$1"
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
}

while IFS= read -r rel; do
  [ -n "$rel" ] && install_file "$rel"
done < <(printf '%s' "$PLANNED")
note "wrote $n_planned new files"

if [ "$n_conflict" -gt 0 ]; then
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    if [ "$FORCE" -eq 1 ]; then
      mkdir -p "$BACKUP_DIR/$(dirname "$rel")"
      cp "$TARGET/$rel" "$BACKUP_DIR/$rel"
      install_file "$rel"
    else
      cp "$FRAMEWORK_DIR/$rel" "$TARGET/$rel.qa-incoming"
    fi
  done < <(printf '%s' "$CONFLICTS")
  if [ "$FORCE" -eq 1 ]; then
    note "replaced $n_conflict conflicting files (backups in ${BACKUP_DIR#$TARGET/})"
  else
    note "wrote $n_conflict .qa-incoming files for manual diff"
  fi
fi

# --- CLAUDE.md: managed block, never a replacement -------------------------
CLAUDE_BLOCK="$(cat <<EOF
$MARK_BEGIN
## QA AI Agents

This repo has the QA agents framework installed (v$VERSION). All project-specific
values live in \`.claude/project-config.json\` — that is the only file you edit.

Start with \`/qa-help\` for a personalized next-step checklist, or \`/qa-init\` to
scaffold a suite. Run \`/qa-selftest\` after upgrading the framework.

Full pipeline reference: \`AI-AUTOMATION-GUIDE.md\`.
$MARK_END
EOF
)"

if [ ! -f "$TARGET/CLAUDE.md" ]; then
  printf '# CLAUDE.md\n\n%s\n' "$CLAUDE_BLOCK" > "$TARGET/CLAUDE.md"
  note "created CLAUDE.md with the QA agents block"
elif grep -qF "$MARK_BEGIN" "$TARGET/CLAUDE.md"; then
  # Refresh in place: keep everything outside the markers byte-for-byte.
  # The block is passed via a FILE, not `awk -v`: awk rejects literal newlines in a -v
  # value ("awk: newline in string"), which made this branch fail while still printing
  # success — the block silently never refreshed on upgrade.
  BLOCK_FILE="$(mktemp)"
  printf '%s\n' "$CLAUDE_BLOCK" > "$BLOCK_FILE"
  if awk -v begin="$MARK_BEGIN" -v end="$MARK_END" -v blockfile="$BLOCK_FILE" '
       index($0, begin) { while ((getline line < blockfile) > 0) print line; close(blockfile); skip = 1; next }
       index($0, end)   { skip = 0; next }
       !skip            { print }
     ' "$TARGET/CLAUDE.md" > "$TARGET/CLAUDE.md.tmp" && [ -s "$TARGET/CLAUDE.md.tmp" ]; then
    mv "$TARGET/CLAUDE.md.tmp" "$TARGET/CLAUDE.md"
    note "refreshed the QA agents block in CLAUDE.md"
    rm -f "$BLOCK_FILE"
  else
    rm -f "$TARGET/CLAUDE.md.tmp"
    printf '\033[33m  warning:\033[0m could not refresh the CLAUDE.md block — yours is unchanged.\n'
    printf '  Paste it in by hand from: %s\n' "$BLOCK_FILE"
  fi
else
  printf '\n%s\n' "$CLAUDE_BLOCK" >> "$TARGET/CLAUDE.md"
  note "appended the QA agents block to your existing CLAUDE.md"
fi

# --- settings.json: suggest, never write ----------------------------------
if [ ! -f "$TARGET/.claude/settings.json" ]; then
  cp "$FRAMEWORK_DIR/.claude/settings.json" "$TARGET/.claude/settings.json"
  note "created .claude/settings.json (hooks + deny rules, no machine-specific paths)"
else
  cp "$FRAMEWORK_DIR/.claude/settings.json" "$TARGET/.claude/settings.qa-suggested.json"
  note "your .claude/settings.json was left alone; ours is at settings.qa-suggested.json"
  echo
  echo "  Your settings.json already exists, so the QA hooks are NOT active yet. Merge them:"
  if command -v jq >/dev/null 2>&1; then
    echo "    cd $TARGET/.claude && jq -s '"'.[0] * .[1]'"' settings.json settings.qa-suggested.json > .merged && mv .merged settings.json"
    echo "  (jq '*' is a shallow merge — check the hooks and permissions arrays afterwards;"
    echo "   arrays are replaced, not concatenated.)"
  else
    echo "    diff $TARGET/.claude/settings.json $TARGET/.claude/settings.qa-suggested.json"
  fi
fi

# --- manifest for future upgrades ----------------------------------------
# `grep .` exits 1 on empty input; with `set -o pipefail` that aborted the whole script on any
# rerun where nothing changed, leaving a truncated, invalid manifest behind. Collect first, guard
# the empty case, and only then write.
FILE_LIST="$(printf '%s' "$ALL_FILES" | grep . | sort -u || true)"
MANIFEST_TMP="$TARGET/.claude/.qa-framework-manifest.json.tmp"
{
  echo "{"
  echo "  \"frameworkVersion\": \"$VERSION\","
  echo "  \"installedAt\": \"$STAMP\","
  echo "  \"files\": ["
  if [ -n "$FILE_LIST" ]; then
    printf '%s\n' "$FILE_LIST" | sed 's/.*/    "&",/' | sed '$ s/,$//'
  fi
  echo "  ]"
  echo "}"
} > "$MANIFEST_TMP" && mv "$MANIFEST_TMP" "$TARGET/.claude/.qa-framework-manifest.json"
note "wrote .claude/.qa-framework-manifest.json"

printf '\n'
printf 'Done. Next:\n'
printf '  1. cd %s\n' "$TARGET"
printf '  2. Edit .claude/project-config.json  (or run /qa-init to fill it in interactively)\n'
printf '  3. Set ticketSource.type — jira | github | azure | clickup | none\n'
printf '  4. Set productCode.stack to your backend framework (default "generic" is noisy)\n'
printf '  5. cp .claude/project-config.local.example.json .claude/project-config.local.json\n'
printf '     and set productCode.rootPaths to your product repo paths\n'
printf '  6. Run /qa-selftest to verify the install, then /qa-help for next steps\n'
