#!/usr/bin/env python3
"""Audit every text-on-fill pair in the source, compositing alpha fills.

The earlier sweeps compared token values directly, which misreports any fill
written with an alpha: `bg-warn/90` over the white surface is not `warn`, it is
`warn` at 90% over white. This resolves each fill against the surface it
actually sits on — the theme's `surface` for a normal fragment, or the nearest
opaque fill earlier in the same fragment when one is present — and then checks
the ratio.

Reports pairs under 4.5:1. Decorative text (`aria-hidden`, or inside an icon
component) is not filtered: the point is to see everything and judge it.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CSS = (ROOT / 'src' / 'index.css').read_text()


def tokens(text: str) -> dict:
    return dict(re.findall(r'--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})', text))


LIGHT = tokens(CSS.split('html.dark {')[0])
DARK = tokens(CSS.split('html.dark {')[1])


def channels(hex_value: str) -> tuple[int, int, int]:
    h = hex_value.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_value: str) -> float:
    r, g, b = (lin(v) for v in channels(hex_value))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def composite(fg: str, alpha: float, bg: str) -> str:
    f, b = channels(fg), channels(bg)
    return '#%02x%02x%02x' % tuple(
        round(f[i] * alpha + b[i] * (1 - alpha)) for i in range(3)
    )


FILL = re.compile(r'^bg-(?P<name>[a-z0-9-]+)(?:/(?P<alpha>[0-9]+))?$')
TEXT = re.compile(r'^text-(?P<name>[a-z0-9-]+)(?:/[0-9]+)?$')


def resolve(fragment: str, theme: str) -> list[tuple[str, str, str]]:
    """Return (text token, resolved fill hex, raw fill) pairs for a fragment."""
    values = LIGHT if theme == 'light' else DARK
    surface = values['surface']
    pairs: list[tuple[str, str, str]] = []
    fills: list[tuple[str, str]] = []  # (name, resolved hex)
    for token in fragment.split():
        m = FILL.match(token)
        if m and m.group('name') in values:
            name = m.group('name')
            alpha = int(m.group('alpha')) / 100 if m.group('alpha') else 1.0
            base = fills[-1][1] if alpha < 1 and fills else surface
            fills.append((name, composite(values[name], alpha, base)))
            continue
        t = TEXT.match(token)
        if t and t.group('name') in values and fills:
            pairs.append((t.group('name'), fills[-1][1], f'bg-{fills[-1][0]}'))
    return pairs


# Fragments whose real background is not the theme surface. Both are inside an
# own-message bubble (`bg-brand`), so a translucent fill composites over the
# brand token, not over `surface`. Verified by hand:
#   ChatsView 3696  on-brand/15 over brand   6.38:1 light / 4.66:1 dark
#   ChatsView 3991  brand-strong/40 over brand 10.39:1 / 6.98:1
# If either line moves, re-check rather than assuming the exemption still holds.
EXCEPTIONS = {
    ('ChatsView.tsx', 'text-on-brand', 'bg-on-brand'),
    ('ChatsView.tsx', 'text-on-brand', 'bg-brand-strong'),
}


def main() -> None:
    check_only = '--check' in sys.argv
    issues: dict[tuple, tuple] = {}
    scanned = 0
    for path in sorted((ROOT / 'src').rglob('*.tsx')):
        source = path.read_text()
        for match in re.finditer(r"(['\"])([^'\"]*)\1", source):
            fragment = match.group(2)
            if 'bg-' not in fragment or 'text-' not in fragment:
                continue
            scanned += 1
            line = source[:match.start()].count('\n') + 1
            for theme in ('light', 'dark'):
                values = LIGHT if theme == 'light' else DARK
                for name, fill_hex, raw in resolve(fragment, theme):
                    r = ratio(values[name], fill_hex)
                    if r < 4.5 and (path.name, f'text-{name}', raw) not in EXCEPTIONS:
                        key = (path.name, theme, f'text-{name}', raw)
                        issues.setdefault(key, (str(path.relative_to(ROOT)), line, round(r, 2)))
    print(f'fragments scanned: {scanned}')
    print(f'pairs under 4.5:1: {len(issues)}')
    for key, (path, line, r) in sorted(issues.items()):
        print(f'  {path}:{line} {key[1]:5} {key[2]:24} on {key[3]:22} {r}')
    if check_only and issues:
        sys.exit(1)


if __name__ == '__main__':
    main()
