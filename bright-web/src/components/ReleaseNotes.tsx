/**
 * Release bodies are author-written Markdown. Rather than pulling in a parser
 * (and rendering arbitrary HTML), this handles the shapes actually used in
 * Bright's release notes: headings, bullets, and paragraphs — as plain text.
 */
export default function ReleaseNotes({ body }: { body: string }) {
  const lines = body.split(/\r?\n/);
  const blocks: Array<
    { type: "heading" | "paragraph"; text: string } | { type: "list"; items: string[] }
  > = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      const last = blocks[blocks.length - 1];
      if (last && last.type === "list") last.items.push(clean(bullet[1]));
      else blocks.push({ type: "list", items: [clean(bullet[1])] });
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", text: clean(heading[1]) });
      continue;
    }

    blocks.push({ type: "paragraph", text: clean(line) });
  }

  if (blocks.length === 0) return null;

  return (
    <div className="mt-4 space-y-3 text-[14.5px] leading-relaxed text-ink-soft">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="text-[14.5px] font-semibold text-ink">
              {block.text}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="space-y-1.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-[0.6em] block size-1 shrink-0 rounded-full bg-ink-faint"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block.text}</p>;
      })}
    </div>
  );
}

/** Strips the inline Markdown emphasis/code markers that survive as noise. */
function clean(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1");
}
