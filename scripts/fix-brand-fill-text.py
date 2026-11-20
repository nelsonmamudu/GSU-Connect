#!/usr/bin/env python3
"""Second pass over the dark-mode contrast misses the token migration left.

Three shapes, all the same root cause: a fragment that sets both the fill and
the text was matched as a whole, so anything split across a ternary (or written
before the palette changed `bg-brand` from dark to light) kept a text colour
that only works on a dark fill.

1. `bg-brand text-white` / `bg-brand border-brand text-white` ternaries — the
   whole literal was skipped because it is not exactly `bg-brand`.
2. `isMine ? '<fill> <text>' : ...` branches whose fill is `bg-brand` or a
   brand-sibling but whose text is a bare `text-white`.
3. `isMine ? 'bg-on-brand/20 ... text-on-brand' : 'bg-brand ... text-white'`
   — the false branch carries the text.

Rules: only touch a fragment that contains a `bg-brand` / `bg-brand-strong` /
`bg-brand-subtle` / `bg-[#0B3F35]` fill; replace only the text utilities
(`text-white`, `hover:text-white`, `text-emerald-50*`) with `on-brand`. Never
touch a fragment that has no brand fill.
"""
import pathlib
import re
import sys

BRAND_FILL = re.compile(r'bg-(brand|brand-strong)\b|bg-\[#0B3F35\]|bg-\[#0b3f35\]')
TEXT_MAP = {
    'text-white': 'text-on-brand',
    'hover:text-white': 'hover:text-on-brand',
    'text-emerald-50': 'text-on-brand',
    'text-emerald-50/90': 'text-on-brand/90',
    'text-emerald-50/95': 'text-on-brand/95',
    'text-emerald-100': 'text-on-brand',
    'text-emerald-100/80': 'text-on-brand/85',
    'text-emerald-100/85': 'text-on-brand/85',
    'text-emerald-100/90': 'text-on-brand/90',
    'text-emerald-200': 'text-on-brand',
    'text-emerald-200/85': 'text-on-brand/85',
}


def fix(fragment: str) -> str:
    if not BRAND_FILL.search(fragment):
        return fragment
    tokens = fragment.split(' ')
    return ' '.join(TEXT_MAP.get(token, token) for token in tokens)


def rewrite(source: str) -> tuple[str, int]:
    count = 0

    # 1. Any quoted fragment in a class list (whole literal or ternary branch).
    def quoted(match: re.Match) -> str:
        nonlocal count
        fixed = fix(match.group(2))
        if fixed != match.group(2):
            count += 1
        return match.group(1) + fixed + match.group(1)

    source = re.sub(r"(['\"])([^'\"]*bg-[^'\"]*)\1", quoted, source)
    # 2. Ternary branches of the form `cond ? '<frag>' : '<frag>'`.
    def ternary(match: re.Match) -> str:
        nonlocal count
        fixed = fix(match.group(2))
        if fixed != match.group(2):
            count += 1
        return match.group(1) + fixed + match.group(3)

    source = re.sub(r"(\?\s*)(['\"])([^'\"]*)\2(\s*:)", lambda m: m.group(1) + m.group(2) + fix(m.group(3)) + m.group(2) + m.group(4), source)
    return source, count


def main() -> None:
    check = '--check' in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    changed = []
    total = 0
    for path in sorted(root.joinpath('src').rglob('*.tsx')):
        source = path.read_text()
        replaced, count = rewrite(source)
        if replaced != source:
            changed.append((str(path.relative_to(root)), count))
            total += count
            if not check:
                path.write_text(replaced)
    print(f"fragments changed: {total} across {len(changed)} files")
    for name, count in changed:
        print(f"  {name}: {count}")


if __name__ == '__main__':
    main()
