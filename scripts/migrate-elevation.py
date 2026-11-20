#!/usr/bin/env python3
"""Map the app's ad-hoc shadow sizes onto the three-step `elevation` scale.

The `elevation` token exists in `ui/styles.ts` but only `Card` and `EmptyState`
consume it; the rest of the app reaches for whichever `shadow-*` utility the
author happened to pick. Six sizes were in use (`2xs`, `xs`, `sm`, `lg`, `xl`,
`2xl`) with no semantic difference between them, which is the "no scale" problem
`shadow-elevation` in the notes calls out.

Three tiers, chosen from what the surfaces actually are:

  resting   <- shadow-2xs, shadow-xs, shadow-sm    cards, panels, chips, controls
  raised    <- shadow-md                           (unused; reserved)
  overlay   <- shadow-lg, shadow-xl, shadow-2xl    sheets, modals, popovers, menus

`shadow-2xs`/`shadow-xs` are both a 1px hairline, so they collapse to the same
tier. `shadow-lg` is a popover, `shadow-xl` a sheet, `shadow-2xl` a modal —
visually distinct but all "above the page", so one token with the size baked in
is the honest reading of the scale.

Colour-tinted shadows (`shadow-emerald-950/50`) are left alone: they are
decorative, not elevation.
"""
import pathlib
import re
import sys

TIER = {
    '2xs': 'resting',
    'xs': 'resting',
    'sm': 'resting',
    'md': 'raised',
    'lg': 'overlay',
    'xl': 'overlay',
    '2xl': 'overlay',
}

SHADOW = re.compile(r'(?<!\[)shadow-(2xs|xs|sm|md|lg|xl|2xl)(?![\w-])')


def convert(match: re.Match) -> str:
    return f'shadow-{TIER[match.group(1)]}'


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
            converted = convert(match)
            if converted != match.group(0):
                count += 1
            return converted

        replaced = SHADOW.sub(replace, source)
        if count:
            changed.append((str(path.relative_to(root)), count))
            total += count
            if not check:
                path.write_text(replaced)
    print(f'shadow utilities mapped: {total} across {len(changed)} files')
    for name, count in changed:
        print(f'  {name}: {count}')


if __name__ == '__main__':
    main()
