#!/usr/bin/env python3
"""Solid state fills need an `on-<state>` text token, not `text-white`.

The palette made every role token swap with the theme, and the state tokens are
no exception: `bg-danger` is #b42318 in light mode and #f97066 in dark mode.
White text on the light value is 6.57:1, on the dark value 2.79:1 — so every
`bg-danger text-white` button was illegible in dark mode. Same for warn (1.85:1)
and success (1.81:1).

The fix is a paired token per state: `<state>-on` is the *dark* value of the
same hue, which clears 4.5:1 on both the light and the dark fill.

  danger-on  #2c1412  on #b42318 9.79:1   on #f97066 5.75:1
  warn-on    #2a1e0c  on #8a4b0b 9.55:1   on #f0b45a 5.60:1
  success-on #04241a  on #0b4f3c 9.55:1   on #6fd3ac 6.25:1
  info-on    #131e33  on #1d4ed8 8.70:1   on #8fb0f5 5.30:1

Only rewrites a fragment that actually contains a solid `bg-<state>` fill, so a
`text-danger` label or a `bg-danger-bg` panel is never touched.
"""
import pathlib
import re
import sys

FILL = re.compile(r'(?<![\w-])bg-(danger|warn|success|info)(?![\w-])')
TEXT_MAP = {
    'text-white': {
        'danger': 'text-danger-on',
        'warn': 'text-warn-on',
        'success': 'text-success-on',
        'info': 'text-info-on',
    },
    'hover:text-white': {
        'danger': 'hover:text-danger-on',
        'warn': 'hover:text-warn-on',
        'success': 'hover:text-success-on',
        'info': 'hover:text-info-on',
    },
}


def fix(fragment: str) -> str:
    states = set(FILL.findall(fragment))
    if not states:
        return fragment
    tokens = fragment.split(' ')
    out = []
    for token in tokens:
        replacement = TEXT_MAP.get(token)
        if replacement and states:
            # A fragment can carry more than one solid fill (a badge row); take
            # the first so the output stays deterministic.
            state = sorted(states)[0]
            out.append(replacement[state])
        else:
            out.append(token)
    return ' '.join(out)


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
            fixed = fix(match.group(2))
            if fixed != match.group(2):
                count += 1
            return match.group(1) + fixed + match.group(1)

        replaced = re.sub(r"(['\"])([^'\"]*)\1", sub, source)
        if count:
            changed.append((str(path.relative_to(root)), count))
            total += count
            if not check:
                path.write_text(replaced)
    print(f'fragments changed: {total} across {len(changed)} files')
    for name, count in changed:
        print(f'  {name}: {count}')


if __name__ == '__main__':
    main()
