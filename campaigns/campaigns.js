/**
 * campaigns.js — Shared markdown parser and utilities for campaign chapter viewers.
 *
 * Exposes: window.CampaignUtils
 *   .parseMarkdown(md)         → HTML string
 *   .splitChapterContent(md)   → { main: string, tldr: string|null }
 *
 * Supported markdown:
 *   ATX headings        # through ######
 *   Setext headings     text\n=== (H1)  text\n--- (H2)
 *   Multi-line setext   multiple lines before === or ---
 *   Bold                **text**
 *   Italic              _text_
 *   Hard line break     trailing backslash \
 *   HTML comments       <!-- … --> (stripped/skipped)
 */
(function () {

  // ── Inline markdown: bold, italic ──────────────────────────────────────────
  function inlineMarkdown(text) {
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    return text;
  }

  /**
   * Render an array of raw lines into inner HTML.
   * A line ending with \ becomes a hard <br> break (backslash is stripped).
   */
  function renderLines(lines) {
    return lines.map(function (line, idx) {
      var raw = line.trimEnd();
      var hardBreak = raw.endsWith('\\');
      var text = inlineMarkdown((hardBreak ? raw.slice(0, -1) : raw).trim());
      if (hardBreak && idx < lines.length - 1) return text + '<br>';
      return text;
    }).join('\n');
  }

  // ── Block parser ───────────────────────────────────────────────────────────
  function parseMarkdown(md) {
    var lines = md.split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var trimmed = lines[i].trim();

      // Skip HTML comments (single-line only)
      if (/^<!--/.test(trimmed)) { i++; continue; }

      // ATX headings: # Heading through ###### Heading
      var atx = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (atx) {
        var lvl = atx[1].length;
        out.push('<h' + lvl + '>' + inlineMarkdown(atx[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }

      // Collect contiguous non-empty lines into a block
      if (trimmed) {
        var block = [];
        while (i < lines.length && lines[i].trim()) {
          block.push(lines[i]);
          i++;
        }

        var last = block[block.length - 1].trim();

        // Setext H1: block ends with ===…
        if (/^=+$/.test(last) && block.length >= 2) {
          out.push('<h1>' + renderLines(block.slice(0, -1)) + '</h1>');
          continue;
        }

        // Setext H2: block ends with ---… (two or more dashes)
        if (/^-{2,}$/.test(last) && block.length >= 2) {
          out.push('<h2>' + renderLines(block.slice(0, -1)) + '</h2>');
          continue;
        }

        // Standalone horizontal rule (--- or ===, single line)
        if (block.length === 1 && (/^-{3,}$/.test(last) || /^={3,}$/.test(last))) {
          out.push('<hr>');
          continue;
        }

        // Regular paragraph
        out.push('<p>' + renderLines(block) + '</p>');
        continue;
      }

      i++;
    }

    return out.join('\n');
  }

  // ── Split at <!-- TLDR --> ─────────────────────────────────────────────────
  function splitChapterContent(md) {
    var MARKER = '<!-- TLDR -->';
    var idx = md.indexOf(MARKER);
    if (idx === -1) return { main: md.trim(), tldr: null };
    return {
      main: md.slice(0, idx).trim(),
      tldr: md.slice(idx + MARKER.length).trim()
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  window.CampaignUtils = {
    parseMarkdown: parseMarkdown,
    splitChapterContent: splitChapterContent
  };

})();
