#!/usr/bin/env python3
"""One-shot migration: ramp utilities -> role tokens.

Prefix-aware on purpose. `dark:bg-slate-800` becomes `dark:bg-sunken`, but a bare
`bg-slate-800` (a scrim or a dark media surface in light mode) is left alone —
mapping it to `sunken` would turn a dark overlay light.

Run with --check to print what would change without writing.
"""
import pathlib
import re
import sys

# (prefix, utility, colour, step) -> role, or None to leave it on the ramp.
NEUTRAL_TEXT_LIGHT = {
    '900': 'ink', '950': 'ink', '800': 'ink',
    '700': 'ink-soft', '600': 'ink-body',
    '500': 'ink-muted', '400': 'ink-muted',
}
NEUTRAL_TEXT_DARK = {
    '100': 'ink', '200': 'ink-soft', '300': 'ink-soft',
    '400': 'ink-muted', '500': 'ink-muted',
}
BG_LIGHT = {'50': 'sunken', '100': 'sunken', '200': 'sunken', '300': 'sunken'}
BG_DARK = {'950': 'canvas', '900': 'surface', '800': 'sunken', '700': 'sunken', '600': 'sunken'}
BORDER_LIGHT = {'100': 'line', '200': 'line', '300': 'line'}
BORDER_DARK = {'600': 'line', '700': 'line', '800': 'line', '900': 'line'}

EMERALD_TEXT_LIGHT = {'500': 'brand', '600': 'brand', '700': 'brand', '800': 'brand', '900': 'brand', '950': 'brand'}
EMERALD_TEXT_DARK = {'100': 'brand', '200': 'brand', '300': 'brand', '400': 'brand'}
EMERALD_BG_LIGHT = {'50': 'brand-subtle', '100': 'brand-subtle', '500': 'brand', '600': 'brand', '700': 'brand', '800': 'brand-strong', '900': 'brand-strong'}
EMERALD_BG_DARK = {'950': 'brand-subtle', '900': 'brand-subtle', '600': 'brand', '500': 'brand'}
EMERALD_BORDER_LIGHT = {'100': 'success-line', '200': 'success-line', '300': 'success-line', '400': 'brand', '500': 'brand', '600': 'brand', '700': 'brand', '800': 'brand', '900': 'success-line'}
EMERALD_BORDER_DARK = {'400': 'brand', '500': 'brand', '600': 'brand', '700': 'brand', '800': 'success-line', '900': 'success-line'}

LIGHT_PREFIXES = ('', 'hover:', 'group-hover:', 'placeholder:', 'focus:', 'focus-within:', 'focus-visible:')
DARK_PREFIXES = ('dark:', 'dark:hover:', 'dark:group-hover:', 'dark:placeholder:', 'dark:focus:', 'dark:focus-within:', 'dark:focus-visible:')

TOKEN = re.compile(
    r'(?<=[\s"`\'=(,{])'
    r'((?:[a-zA-Z-]+:)*)'
    r'(bg|text|border|ring|divide|accent|from|to|via|shadow|placeholder)'
    r'-(slate|emerald)'
    r'-(\d{2,3})'
    r'((?:/\d+)?)'
)


def role_for(prefix: str, utility: str, colour: str, step: str, alpha: str):
    dark = prefix.startswith('dark:')
    if colour == 'slate':
        if utility == 'text':
            table = NEUTRAL_TEXT_DARK if dark else NEUTRAL_TEXT_LIGHT
            return table.get(step)
        if utility == 'bg':
            table = BG_DARK if dark else BG_LIGHT
            return table.get(step)
        if utility == 'border':
            table = BORDER_DARK if dark else BORDER_LIGHT
            return table.get(step)
        if utility == 'divide':
            return 'line'
        return None
    # emerald
    if utility == 'text':
        table = EMERALD_TEXT_DARK if dark else EMERALD_TEXT_LIGHT
        return table.get(step)
    if utility == 'bg':
        if step in ('50', '100', '200', '300', '400'):
            return None if not dark and step in ('200', '300', '400') else 'brand-subtle'
        table = EMERALD_BG_DARK if dark else EMERALD_BG_LIGHT
        return table.get(step)
    if utility == 'border':
        table = EMERALD_BORDER_DARK if dark else EMERALD_BORDER_LIGHT
        return table.get(step)
    if utility == 'ring':
        # Only focus rings move; decorative tinted rings stay on the ramp.
        return 'focus' if prefix in (
            'focus:', 'focus-within:', 'focus-visible:',
            'dark:focus:', 'dark:focus-within:', 'dark:focus-visible:',
        ) else None
    if utility == 'accent':
        return 'brand'
    if utility == 'from':
        return 'brand'
    return None


def main() -> None:
    check = '--check' in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    changed = []
    totals = {}
    leftovers = {}
    for path in sorted(root.joinpath('src').rglob('*.tsx')):
        source = path.read_text()
        output = []
        last = 0
        dirty = False
        for match in TOKEN.finditer(source):
            prefix, utility, colour, step, alpha = match.groups()
            role = role_for(prefix, utility, colour, step, alpha)
            if role is None:
                key = f"{prefix}{utility}-{colour}-{step}{alpha}"
                leftovers[key] = leftovers.get(key, 0) + 1
                continue
            replacement = f"{prefix}{utility}-{role}{alpha}"
            output.append(source[last:match.start()])
            output.append(replacement)
            last = match.end()
            dirty = True
            key = f"{match.group(0)} -> {replacement}"
            totals[key] = totals.get(key, 0) + 1
        if not dirty:
            continue
        output.append(source[last:])
        changed.append(str(path.relative_to(root)))
        if not check:
            path.write_text(''.join(output))

    print(f"files changed: {len(changed)}")
    for name in changed:
        print(f"  {name}")
    print("\n=== replacements (top 40) ===")
    for key, count in sorted(totals.items(), key=lambda item: -item[1])[:40]:
        print(f"{count:5d}  {key}")
    print(f"\n=== left on the ramp: {len(leftovers)} distinct ===")
    for key, count in sorted(leftovers.items(), key=lambda item: -item[1]):
        print(f"{count:5d}  {key}")


if __name__ == '__main__':
    main()
