/**
 * Splits a line into per-word spans so a headline can build itself a word at a
 * time instead of arriving as one block.
 *
 * ## Why the text is written twice
 *
 * Each word becomes an `inline-block`, which is what lets it be moved
 * independently. Screen readers treat a run of inline-block boxes as separate
 * chunks and can insert a pause between every one, turning a headline into a
 * word. by. word. reading. So the real sentence is exposed once, off screen and
 * unsplit, and the visual spans are hidden from the accessibility tree.
 *
 * The index each word carries is its position in the cascade. The stagger step
 * itself is in the stylesheet, because how fast the words arrive is a design
 * decision, not a structural one.
 */

import type { CSSProperties } from "react";

export function SplitWords(props: { text: string }) {
  const words = props.text.split(" ");

  return (
    <>
      <span className="sr-only">{props.text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <span key={index}>
            <span className="word" style={{ "--word-index": index } as CSSProperties}>
              {word}
            </span>
            {/* A real space between the boxes, not inside them, so the line
                still breaks where it wants to. */}
            {index === words.length - 1 ? null : " "}
          </span>
        ))}
      </span>
    </>
  );
}
