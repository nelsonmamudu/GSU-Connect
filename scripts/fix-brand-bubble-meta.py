#!/usr/bin/env python3
"""Meta text inside an own-message bubble sits on `bg-brand`, which flips to a
light green in dark mode. Light-green-on-light-green is illegible, so every
`isMine ? '<fragment>'` true-branch is moved onto the `on-brand` token.

Only the true branch is touched: the false branch is the other person's bubble,
which is light in both modes and already uses the ink tokens.
"""
import pathlib
import re
import sys

TRUE_BRANCH = re.compile(r"(isMine\s*\?\s*)(['\"])(.*?)\2", re.S)

# Light-on-brand colours, with the alpha that still clears 4.5:1 on the dark
# brand fill (#4fa582). /80 falls just short at 4.4:1, so it becomes /85.
MAP = {
    'text-emerald-50/90': 'text-on-brand/90',
    'text-emerald-50/95': 'text-on-brand/95',
    'text-emerald-50': 'text-on-brand',
    'text-emerald-100/80': 'text-on-brand/85',
    'text-emerald-100/85': 'text-on-brand/85',
    'text-emerald-100/90': 'text-on-brand/90',
    'text-emerald-100': 'text-on-brand',
    'text-emerald-200/85': 'text-on-brand/85',
    'text-emerald-200': 'text-on-brand',
    'text-white': 'text-on-brand',
    'hover:text-white': 'hover:text-on-brand',
    'hover:bg-white/10': 'hover:bg-on-brand/10',
    'border-white/25': 'border-on-brand/40',
    'border-white/80': 'border-on-brand/80',
    'bg-white/20': 'bg-on-brand/20',
}


def fix(fragment: str) -> str:
    tokens = fragment.split(' ')
    return ' '.join(MAP.get(token, token) for token in tokens)


def main() -> None:
    check = '--check' in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    changed = []
    total = 0
    for path in sorted(root.joinpath('src').rglob('*.tsx')):
        source = path.read_text()
        count = 0

        def replace(match: re.Match) -> str:
            nonlocal count
            fixed = fix(match.group(3))
            if fixed != match.group(3):
                count += 1
            return match.group(1) + match.group(2) + fixed + match.group(2)

        replaced = TRUE_BRANCH.sub(replace, source)
        if replaced != source:
            changed.append((str(path.relative_to(root)), count))
            total += count
            if not check:
                path.write_text(replaced)
    print(f"true branches changed: {total} across {len(changed)} files")
    for name, count in changed:
        print(f"  {name}: {count}")


if __name__ == '__main__':
    main()
