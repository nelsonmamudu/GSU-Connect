#!/usr/bin/env python3
"""`bg-brand` flips from dark to light in dark mode, so white text on it fails.

The first pass only fixed `text-white` when it shared a className string with
`bg-brand`. Most call sites are ternaries inside template literals, so they were
missed.

Finding the fragments needs a real scanner rather than a quote-pairing regex: a
`'` inside one `${...}` branch otherwise pairs with a `'` in another and swallows
the JSX between them.
"""
import pathlib
import re
import sys

BRAND_FILL = re.compile(
    r'(?:^|\s)(?:dark:)?(?:hover:)?bg-brand(?:-strong)?(?:/\d+)?(?:\s|$)'
)
CLASSISH = re.compile(r'(?:^|\s)(?:bg|text|border|ring|rounded|min-|max-|w-|h-|px|py|pt|pb|pl|pr|p|m|mx|my|mt|mb|ml|mr|flex|grid|items|justify|gap|font|shadow|inline|transition|cursor|hover:|dark:|duration|ease|animate|opacity|truncate|select|whitespace|leading|tracking|uppercase|underline|sr-only|absolute|relative|fixed|sticky|top|bottom|left|right|inset|z-|overflow|shrink|grow|order|col|row|space|divide|self|place|pointer|break|tabular|capitalize|italic|bold|semibold|medium|normal|antialiased|aspect|object|blur|backdrop|from|via|to|ring-offset|outline|accent|align|list|resize|scroll|snap|touch|will-change|appearance|fill|stroke|filter|origin|scale|rotate|skew|translate|perspective|transform|backface|pointer-events)[-\w\[\]/.:%,#()]*')


def scan_literals(source: str):
    """Yield (start, end, quote, body) for every string literal, recursing into
    `${...}` so ternary class branches are seen as their own literals."""
    out = []
    _scan(source, 0, len(source), out)
    return out


def _scan(s: str, start: int, end: int, out: list) -> None:
    i = start
    while i < end:
        c = s[i]
        if c == '/' and i + 1 < end and s[i + 1] == '/':
            j = s.find('\n', i, end)
            i = end if j == -1 else j
            continue
        if c == '/' and i + 1 < end and s[i + 1] == '*':
            j = s.find('*/', i + 2, end)
            i = end if j == -1 else j + 2
            continue
        if c in ('"', "'"):
            j = i + 1
            while j < end:
                if s[j] == '\\':
                    j += 2
                    continue
                if s[j] == c:
                    break
                j += 1
            out.append((i, min(j + 1, end), c, s[i + 1:j]))
            i = j + 1
            continue
        if c == '`':
            j = i + 1
            chunk = i + 1
            while j < end:
                if s[j] == '\\':
                    j += 2
                    continue
                if s[j] == '`':
                    out.append((chunk, j, '`', s[chunk:j]))
                    j += 1
                    break
                if s[j] == '$' and j + 1 < end and s[j + 1] == '{':
                    out.append((chunk, j, '`', s[chunk:j]))
                    depth = 1
                    k = j + 2
                    while k < end and depth:
                        if s[k] == '\\':
                            k += 2
                            continue
                        if s[k] == '{':
                            depth += 1
                        elif s[k] == '}':
                            depth -= 1
                        k += 1
                    _scan(s, j + 2, k - 1, out)
                    j = k
                    chunk = j
                    continue
                j += 1
            i = max(j, chunk)
            continue
        i += 1


def looks_like_classes(body: str) -> bool:
    if re.search(r'[\n{}<>]', body):
        return False
    return bool(CLASSISH.search(body))


def fix(fragment: str) -> str:
    if not BRAND_FILL.search(fragment):
        return fragment
    fragment = re.sub(r'(?<![-\w])text-white(?:/\d+)?', 'text-on-brand', fragment)
    fragment = re.sub(r'(?<![-\w])hover:text-white(?:/\d+)?', 'hover:text-on-brand', fragment)
    return fragment


def main() -> None:
    check = '--check' in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    changed = []
    total = 0
    for path in sorted(root.joinpath('src').rglob('*.tsx')):
        source = path.read_text()
        edits = []
        for start, end, quote, body in scan_literals(source):
            if not looks_like_classes(body):
                continue
            fixed = fix(body)
            if fixed != body:
                edits.append((start + 1, end - 1, fixed))
        if not edits:
            continue
        pieces = []
        cursor = 0
        for start, end, fixed in edits:
            pieces.append(source[cursor:start])
            pieces.append(fixed)
            cursor = end
        pieces.append(source[cursor:])
        replaced = ''.join(pieces)
        changed.append((str(path.relative_to(root)), len(edits)))
        total += len(edits)
        if not check:
            path.write_text(replaced)
    print(f"fragments changed: {total} across {len(changed)} files")
    for name, count in changed:
        print(f"  {name}: {count}")


if __name__ == '__main__':
    main()
