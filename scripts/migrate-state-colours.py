#!/usr/bin/env python3
"""Move the semantic state colours off the Tailwind ramps and onto the role
tokens.

`index.css` already defines `danger` / `warn` / `success` / `info`, each with a
`-bg` and a `-line`, in both themes, all contrast-checked (5.75-8.83:1). Every
one of the ~700 red/amber/rose/emerald/sky/indigo/teal/violet utilities in the
components is a hand-rolled `bg-X-50 dark:bg-X-950/50 text-X-700 dark:text-X-300`
quad. They render, but each one is a bespoke recipe that has to be re-checked by
hand whenever the palette moves — which is exactly what the token layer exists to
avoid.

Mapping, by role:

  danger  <- red, rose
  warn    <- amber
  success <- emerald, teal
  info    <- sky, indigo, violet

Per step, and only for the utility prefixes that set a colour (`bg`, `text`,
`border`, `ring`, `divide`, `from`, `to`, `via`, `fill`, `stroke`):

  *-50            -> <role>-bg
  *-100, *-200    -> <role>-line          (borders and soft fills)
  *-300, *-400    -> <role>               (dark-mode text, icons)
  *-500, *-600,
    *-700, *-800,
    *-900          -> <role>               (solid fills, light-mode text)
  *-950           -> <role>-bg             (dark-mode panel fill)

The alpha suffix is preserved on the substitution, because the quad uses alpha to
modulate the same role (`bg-red-950/50` -> `bg-danger-bg/50`).

Anything outside these prefixes is left alone: `decoration-`, `accent-`,
`caret-`, `placeholder-` and the `shadow-*` colour utilities are not part of the
state quad and are audited separately.
"""
import pathlib
import re
import sys

ROLE_OF = {
    'red': 'danger',
    'rose': 'danger',
    'amber': 'warn',
    'emerald': 'success',
    'teal': 'success',
    'sky': 'info',
    'indigo': 'info',
    'violet': 'info',
}

STEP_OF = {
    '50': '-bg',
    '100': '-line',
    '200': '-line',
    '300': '',
    '400': '',
    '500': '',
    '600': '',
    '700': '',
    '800': '',
    '900': '',
    '950': '-bg',
}

PREFIXES = (
    'bg', 'text', 'border', 'ring', 'divide', 'from', 'to', 'via', 'fill', 'stroke',
)

# `dark:bg-red-950/50` and `bg-red-950/50` both match; the variant prefix is kept.
# The step alternation is longest-first: `50` would otherwise match the `50` of
# `500` and leave a dangling `0`.
TOKEN = re.compile(
    r'(?P<variant>(?:dark|hover|focus|focus-visible|active|group-hover|visited|disabled|md|sm|lg|xl):)*'
    r'(?P<prefix>' + '|'.join(PREFIXES) + r')-'
    r'(?P<family>red|rose|amber|emerald|teal|sky|indigo|violet)-'
    r'(?P<step>950|900|800|700|600|500|400|300|200|100|50)'
    r'(?P<alpha>/[0-9]+)?'
)

PLAIN_PREFIXES = {'divide', 'fill', 'stroke', 'from', 'to', 'via'}


def convert(match: re.Match) -> str:
    family = match.group('family')
    step = match.group('step')
    role = ROLE_OF[family]
    suffix = STEP_OF[step]
    target = f"{role}{suffix}" if suffix else role
    target = re.sub(r"-{2,}", "-", target)
    prefix = match.group('prefix')
    variant = match.group('variant') or ''
    alpha = match.group('alpha') or ''
    return f'{variant}{prefix}-{target}{alpha}'


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

        replaced = TOKEN.sub(replace, source)
        if count:
            changed.append((str(path.relative_to(root)), count))
            total += count
            if not check:
                path.write_text(replaced)
    print(f'state colour utilities rewritten: {total} across {len(changed)} files')
    for name, count in changed:
        print(f'  {name}: {count}')


if __name__ == '__main__':
    main()
