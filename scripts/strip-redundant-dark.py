#!/usr/bin/env python3
"""Remove `dark:` duplicates of role tokens.

The palette moved dark mode to a token swap: `index.css` redefines every role
token under `html.dark`, so a component that reads `bg-surface text-ink` is
already correct in both modes. `dark:bg-surface` / `dark:text-ink` on top of
that is a no-op that survives only because the earlier migration stripped
`dark:` variants of *ramp* classes, not of role tokens.

Safe rule: drop `dark:<prefix>-<role>` from a class fragment only when the same
fragment already sets `<prefix>-<role>` (same prefix, same role, no alpha
difference). `dark:bg-sunken/70` next to `bg-sunken` is kept — the alpha makes
it a real override.
"""
import pathlib
import re
import sys

ROLE = (
    r'(?:canvas|surface|sunken|line|line-strong|ink|ink-soft|ink-body|ink-muted'
    r'|brand|brand-strong|brand-subtle|on-brand|focus|success|warn|danger|info)'
)
PREFIX = r'(?:hover:|focus-visible:|focus:|active:|group-hover:)?(?:bg|text|border|ring|fill|stroke|divide|outline|decoration|accent|caret|placeholder|from|to|via)'
BASE = re.compile(rf'^(?P<p>{PREFIX})-(?P<r>{ROLE})(?P<s>-bg|-line)?$')
DARK = re.compile(rf'^dark:(?P<p>{PREFIX})-(?P<r>{ROLE})(?P<s>-bg|-line)?(?P<a>/[0-9]+)?$')


def clean(fragment: str) -> tuple[str, int]:
    tokens = fragment.split(' ')
    base = {}
    for token in tokens:
        m = BASE.match(token)
        if m:
            base.setdefault((m.group('p'), m.group('r'), m.group('s')), set()).add(token)
    kept = []
    removed = 0
    for token in tokens:
        m = DARK.match(token)
        if m and not m.group('a'):
            key = (m.group('p'), m.group('r'), m.group('s'))
            if key in base:
                removed += 1
                continue
        kept.append(token)
    # collapse the double spaces a removal can leave behind
    return ' '.join(kept), removed


def main() -> None:
    check = '--check' in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    changed = []
    total = 0
    for path in sorted(root.joinpath('src').rglob('*.tsx')):
        source = path.read_text()
        count = 0

        def sub(match: re.Match) -> str:
            nonlocal count
            fixed, removed = clean(match.group(2))
            count += removed
            return match.group(1) + fixed + match.group(1)

        replaced = re.sub(r"(['\"])([^'\"]*)\1", sub, source)
        if count:
            changed.append((str(path.relative_to(root)), count))
            total += count
            if not check:
                path.write_text(replaced)
    print(f"dark: duplicates removed: {total} across {len(changed)} files")
    for name, count in changed:
        print(f"  {name}: {count}")


if __name__ == '__main__':
    main()
