#!/usr/bin/env python3
"""Clean up after migrate-tokens.py.

1. `bg-[#F6F8F7]` -> `bg-canvas`, bare `bg-white` -> `bg-surface`.
2. `text-white` on a brand fill -> `text-on-brand`, so dark mode (where the
   brand fill becomes light) keeps readable text.
3. Drop `dark:X` when the plain `X` is already a role utility in the same class
   string — the token already swaps, so the duplicate is dead weight.
"""
import pathlib
import re
import sys

ROLE = (
    'canvas|surface|sunken|line|line-strong|ink|ink-soft|ink-body|ink-muted|'
    'brand|brand-strong|brand-subtle|on-brand|focus|'
    'success|success-bg|success-line|warn|warn-bg|warn-line|'
    'danger|danger-bg|danger-line|info|info-bg|info-line'
)
ROLE_TOKEN = re.compile(
    r'^(?:[a-z-]+:)*'
    r'(?:bg|text|border|ring|divide|from|to|via|accent|placeholder|fill|stroke|shadow)-'
    r'(?:' + ROLE + r')'
    r'(?:/\d+)?$'
)
CLASS_STRING = re.compile(r'(className\s*=\s*)(["\'`])((?:\\.|(?!\2).)*)\2')


def fix_class_string(value: str) -> str:
    tokens = []
    for token in value.split(' '):
        if 'bg-[#F6F8F7]' in token:
            token = token.replace('bg-[#F6F8F7]', 'bg-canvas')
        if re.fullmatch(r'bg-white', token):
            token = 'bg-surface'
        tokens.append(token)

    has_brand_fill = any(
        re.search(r'(?:^|\s)(?:dark:)?bg-brand(?:-strong)?(?:/\d+)?$', t)
        for t in tokens
    )
    if has_brand_fill:
        tokens = [
            'text-on-brand' if re.fullmatch(r'text-white(?:/\d+)?', t) else t
            for t in tokens
        ]
        tokens = [t.replace('dark:ring-slate-900', 'dark:ring-surface') for t in tokens]

    drop = set()
    for index, token in enumerate(tokens):
        if not token.startswith('dark:'):
            continue
        rest = token[len('dark:'):]
        if ROLE_TOKEN.match(rest) and rest in tokens:
            drop.add(index)
    result = ' '.join(t for i, t in enumerate(tokens) if i not in drop)
    return re.sub(r' {2,}', ' ', result).strip()


def main() -> None:
    check = '--check' in sys.argv
    root = pathlib.Path(__file__).resolve().parent.parent
    changed = []
    for path in sorted(root.joinpath('src').rglob('*.tsx')):
        source = path.read_text()
        replaced = CLASS_STRING.sub(
            lambda m: m.group(1) + m.group(2) + fix_class_string(m.group(3)) + m.group(2),
            source,
        )
        if replaced != source:
            changed.append(str(path.relative_to(root)))
            if not check:
                path.write_text(replaced)
    print(f"files changed: {len(changed)}")
    for name in changed:
        print(f"  {name}")


if __name__ == '__main__':
    main()
