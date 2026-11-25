import { describe, it, expect, vi } from "vitest";

const { createHighlighter } = vi.hoisted(() => ({
  createHighlighter: vi.fn(),
}));

// Shiki is mocked whole: no markdown input makes the real codeToHtml throw
// once the language is constrained to COMMENT_LANGS, so the lazy-init block
// and the catch fallback can only be graded against a fake that fails.
vi.mock("shiki", () => ({ createHighlighter }));

import { renderComment } from "./comment-markdown.server";
import { markdown } from "./text";

describe("renderComment with a broken shiki", () => {
  it("creates the highlighter once, then falls back to escaped plain text", async () => {
    createHighlighter.mockResolvedValue({
      codeToHtml: () => {
        throw new Error("boom");
      },
    });

    await renderComment(markdown("```typescript\nconst a = 1;\n```"));
    const html = await renderComment(
      markdown("```typescript\nconst b = 2;\n```")
    );

    // One highlighter serves every comment, not one per render.
    expect(createHighlighter).toHaveBeenCalledTimes(1);
    expect(createHighlighter).toHaveBeenCalledWith(
      expect.objectContaining({ themes: ["github-dark"] })
    );

    // The failed block still renders, as an escaped plain <pre>.
    expect(html).toContain("<pre><code>");
    expect(html).toContain("const b = 2;");
  });
});
