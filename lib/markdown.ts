// Tiny, dependency-free Markdown renderer scoped to what the essay drafter
// actually emits: headings, paragraphs, bold/italic/inline-code spans, bullet
// and ordered lists, and footnote references. We intentionally don't pull a
// full markdown library — the surface is small and the prose-essay CSS class
// in globals.css handles all the styling.
//
// All input is HTML-escaped before any markdown parsing — so user content
// (essay drafts, citations) cannot inject HTML.

export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input);
  const lines = escaped.split("\n");
  const html: string[] = [];

  type ListMode = "ul" | "ol" | null;
  let listMode: ListMode = null;

  function closeList() {
    if (listMode) {
      html.push(`</${listMode}>`);
      listMode = null;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    const ulItem = /^[-*]\s+(.*)$/.exec(trimmed);
    if (ulItem) {
      if (listMode !== "ul") {
        closeList();
        html.push("<ul>");
        listMode = "ul";
      }
      html.push(`<li>${renderInline(ulItem[1])}</li>`);
      continue;
    }

    const olItem = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (olItem) {
      if (listMode !== "ol") {
        closeList();
        html.push("<ol>");
        listMode = "ol";
      }
      html.push(`<li>${renderInline(olItem[1])}</li>`);
      continue;
    }

    // Footnote definition: [^1]: text
    const footnoteDef = /^\[\^(\d+)\]:\s*(.*)$/.exec(trimmed);
    if (footnoteDef) {
      closeList();
      html.push(
        `<p><sup id="fn-${footnoteDef[1]}">${footnoteDef[1]}.</sup> ${renderInline(footnoteDef[2])}</p>`,
      );
      continue;
    }

    // Default: paragraph
    closeList();
    html.push(`<p>${renderInline(trimmed)}</p>`);
  }
  closeList();
  return html.join("\n");
}

function renderInline(text: string): string {
  let out = text;
  // Inline code: `code` (must come before bold/italic so contents aren't styled).
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  // Footnote refs: [^1] → superscript link
  out = out.replace(
    /\[\^(\d+)\]/g,
    (_, n) => `<sup><a href="#fn-${n}">${n}</a></sup>`,
  );
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Italic: *text* (lazy, avoids matching across **bold**)
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return out;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
