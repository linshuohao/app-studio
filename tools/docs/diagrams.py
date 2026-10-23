"""Render semantic diagram data using the shared document styles, without browser dependencies."""
from __future__ import annotations

import html
import math
import re


def render_canvas(spec: dict) -> str:
    """Render positioned semantic nodes; the Markdown remains the only content source."""
    anchor = spec['id']

    def numbers(values, size):
        if not isinstance(values, list) or len(values) != size or any(
            type(value) not in (int, float) or not math.isfinite(value) or value < 0
            for value in values
        ):
            raise ValueError(f'Invalid diagram coordinates: {anchor}')
        return values

    width, height = numbers(spec['canvas'], 2)
    if not width or not height:
        raise ValueError(f'Empty diagram canvas: {anchor}')
    escape = html.escape
    nodes = [node for row in spec['rows'] for node in row]
    parts = [f'<figure class="architecture-diagram canvas-diagram" id="{anchor}">',
             '<figcaption>' + escape(spec['title']) + '</figcaption>',
             '<div class="diagram-canvas-shell">',
             f'<svg class="diagram-canvas" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(spec["title"], quote=True)}" xmlns="http://www.w3.org/2000/svg">',
             '<title>' + escape(spec['title']) + '</title>',
             '<defs><marker id="' + anchor + '-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path class="diagram-arrowhead" d="M0,0 L10,5 L0,10 Z"/></marker></defs>']

    def node_markup(node):
        x, y, w, h = numbers(node['position'], 4)
        if x + w > width or y + h > height or not w or not h:
            raise ValueError(f'Diagram node outside canvas: {anchor}')
        kind = node.get('kind', 'node')
        if kind not in {'node', 'group', 'state', 'label', 'asset', 'host', 'reaction', 'validation', 'layer'}:
            raise ValueError(f'Unknown diagram node kind: {kind}')
        result = [f'<g class="diagram-block diagram-block--{kind}">']
        if kind != 'label':
            result.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14"/>')
        result.append(f'<text class="diagram-node-title" x="{x + 18}" y="{y + 34}">' + escape(node['title']) + '</text>')
        lines = node.get('body', '').splitlines() + node.get('items', [])
        for index, line in enumerate(lines):
            result.append(f'<text class="diagram-node-body" x="{x + 18}" y="{y + 72 + index * 32}">' + escape(line) + '</text>')
        return '\n'.join(result) + '</g>'

    # Group boundaries sit behind connections; foreground nodes cover crossing endpoints.
    parts.extend(node_markup(node) for node in nodes if node.get('kind') == 'group')
    for edge in spec.get('edges', []):
        points = [numbers(point, 2) for point in edge['points']]
        if len(points) < 2 or any(x > width or y > height for x, y in points):
            raise ValueError(f'Diagram edge outside canvas: {anchor}')
        points_text = ' '.join(f'{x},{y}' for x, y in points)
        arrow = '' if edge.get('arrow') is False else f' marker-end="url(#{anchor}-arrow)"'
        if edge.get('both'):
            arrow += f' marker-start="url(#{anchor}-arrow)"'
        dash = ' diagram-edge--binding' if edge.get('binding') else ''
        parts.append(f'<polyline class="diagram-edge{dash}" points="{points_text}"{arrow}/>')
    parts.extend(node_markup(node) for node in nodes if node.get('kind') != 'group')
    parts.append('</svg></div>')
    if spec.get('note'):
        parts.append('<p class="caption arch-note">' + escape(spec['note']) + '</p>')
    return '\n'.join(parts) + '</figure>'


def render_diagram(spec: dict) -> str:
    """A diagram consists of node rows, connecting labels and an optional explanatory note."""
    anchor = spec["id"]
    if not re.fullmatch(r"[a-z][a-z0-9-]*", anchor):
        raise ValueError(f"Invalid diagram anchor: {anchor}")
    rows = spec["rows"]
    if not rows or any(not row for row in rows):
        raise ValueError(f"Diagram needs nonempty node rows: {anchor}")
    if spec.get('canvas'):
        return render_canvas(spec)
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
