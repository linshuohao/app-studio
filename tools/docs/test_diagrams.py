"""Positioned diagram rendering: safe markup, complete labels and source integration."""
from copy import deepcopy
import json
from pathlib import Path
import re
import unittest
from xml.etree import ElementTree

from build_docs import decorate
from diagrams import render_diagram
from knowledge import plain


class PositionedDiagrams(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(__file__).resolve().parents[2] / 'docs/design/l3-reactive-engine.md'
        cls.source = source.read_text()
        cls.spec = next(json.loads(block) for block in re.findall(
            r'^```diagram\n(.*?)^```', cls.source, re.M | re.S
        ) if json.loads(block)['id'] == 'figure-runtime-overview')

    def test_complete_overview_is_searchable_and_valid_svg(self):
        markup = render_diagram(self.spec)
        svg = ElementTree.fromstring(re.search(r'<svg\b.*?</svg>', markup, re.S)[0])
        self.assertEqual(svg.attrib['role'], 'img')
        self.assertTrue(svg.attrib['aria-label'])
        visible = ''.join(svg.itertext())
        searchable = plain('```diagram\n' + json.dumps(self.spec, ensure_ascii=False) + '\n```')
        for label in ('Reaction Pending', 'Validation Pending', 'Manifest / 契约',
                      'Slots / Events / Requests', '统一表达式 / 纯函数求值',
                      'Request Bridge', '来源 / 字段一致发布', 'Host 行为 · host.emit', '超限中止并清队列'):
            self.assertIn(label, visible)
            self.assertIn(label, searchable)
        self.assertNotIn('超限则暂停', visible)
        self.assertIn('figure-runtime-overview-arrow', markup)
        self.assertNotIn('"position"', searchable)

    def test_canvas_text_is_escaped_after_markdown_sanitization(self):
        spec = deepcopy(self.spec)
        spec['title'] = '"><script>alert(1)</script>'
        spec['rows'][0][0]['body'] = '<img src=x onerror=alert(1)>'
        # decorate runs after the Markdown sanitizer; the renderer must escape itself.
        import html
        markup = decorate('<pre><code class="language-diagram">' +
                          html.escape(json.dumps(spec)) + '</code></pre>')
        self.assertNotIn('<script>', markup)
        self.assertNotIn('<img ', markup)
        self.assertIn('&lt;script&gt;', markup)

    def test_invalid_coordinates_and_kinds_cannot_become_svg_attributes(self):
        for field, value in [('position', [0, 0, float('nan'), 50]),
                             ('position', [0, 0, 2000, 50]),
                             ('position', [0, 0, '1" onload="alert(1)', 50]),
                             ('kind', 'node" onload="alert(1)')]:
            with self.subTest(field=field, value=value):
                spec = deepcopy(self.spec)
                spec['rows'][0][0][field] = value
                with self.assertRaises(ValueError):
                    render_diagram(spec)
        spec = deepcopy(self.spec)
        spec['edges'][0]['points'] = [[0, 0], [2000, 0]]
        with self.assertRaises(ValueError):
            render_diagram(spec)

    def test_existing_row_and_matrix_diagrams_keep_their_renderers(self):
        base = {'id': 'figure-old', 'title': '原图', 'rows': [[{'title': '节点'}]]}
        self.assertIn('class="arch-row"', render_diagram(base))
        self.assertNotIn('<svg', render_diagram(base))
        self.assertIn('capability-matrix', render_diagram({**base, 'columns': ['主题']}))


if __name__ == '__main__':
    unittest.main()
