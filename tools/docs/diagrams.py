"""Render semantic diagram data using the shared document styles, without browser dependencies."""
from __future__ import annotations

import html
import re


def render_diagram(spec: dict) -> str:
    """A diagram consists of node rows, connecting labels and an optional explanatory note."""
    anchor = spec["id"]
    if not re.fullmatch(r"[a-z][a-z0-9-]*", anchor):
        raise ValueError(f"Invalid diagram anchor: {anchor}")
    rows = spec["rows"]
    if not rows or any(not row for row in rows):
        raise ValueError(f"Diagram needs nonempty node rows: {anchor}")
    if spec.get('columns'):
        columns = spec['columns']
        if any(len(row) != len(columns) for row in rows):
            raise ValueError(f"Capability matrix column mismatch: {anchor}")
        parts = [f'<figure class="architecture-diagram capability-matrix" id="{anchor}"><figcaption>{html.escape(spec["title"])}</figcaption><div class="table-wrap"><table><thead><tr>']
        parts += ['<th scope="col">' + html.escape(label) + '</th>' for label in columns]
        parts.append('</tr></thead><tbody>')
        for row in rows:
            parts.append('<tr>')
            for index, node in enumerate(row):
                tag = 'th scope="row"' if index == 0 else 'td'
                parts.append('<' + tag + '><strong>' + html.escape(node['title']) + '</strong>' + ('<p>' + html.escape(node['body']) + '</p>' if node.get('body') else '') + ('</th>' if index == 0 else '</td>'))
            parts.append('</tr>')
        parts.append('</tbody></table></div>')
        if spec.get('note'): parts.append('<p class="caption">' + html.escape(spec['note']) + '</p>')
        return '\n'.join(parts) + '</figure>'
    arrows = spec.get("arrows", ["↓"] * (len(rows) - 1))
    if len(arrows) != len(rows) - 1:
        raise ValueError(f"Diagram connector count does not match rows: {anchor}")
    parts = [f'<figure class="architecture-diagram" id="{anchor}"><figcaption>{html.escape(spec["title"])}</figcaption>']
    for i, row in enumerate(rows):
        if i:
            parts.append(f'<div class="arch-connector">{html.escape(arrows[i - 1])}</div>')
        parts.append('<div class="arch-row' + (' arch-row--flow' if spec.get('flow') else '') + '">')
        for j, node in enumerate(row):
            if j and spec.get("flow"):
                parts.append('<span class="arch-flow-arrow" aria-hidden="true">→</span>')
            parts.append('<div class="arch-node' + (' arch-node--major' if node.get('major') else '') + '">')
            parts.append('<h4>' + html.escape(node['title']) + '</h4>')
            if node.get('body'):
                parts.append('<p>' + html.escape(node['body']) + '</p>')
            if node.get('items'):
                parts.append('<ul class="arch-chips">' + ''.join('<li>' + html.escape(item) + '</li>' for item in node['items']) + '</ul>')
            parts.append('</div>')
        parts.append('</div>')
    if spec.get('note'):
        parts.append('<p class="caption arch-note">' + html.escape(spec['note']) + '</p>')
    parts.append('</figure>')
    return '\n'.join(parts)
