"use client";

/**
 * Reveals a section as it enters the viewport, in one of four ways.
 *
 * ## Why four and not one
 *
 * A page where every block fades up by the same eighteen pixels reads as a
 * template, because the eye learns the move after the second section and then
 * predicts it for the rest of the page. Varying the entrance is what makes the
 * scroll feel authored: prose rises, artifacts lift and settle, a headline
 * block is wiped up behind its own edge, and a list arrives one item at a time.
 *
 * The variant is a presentation choice, so it picks a class and every value
 * lives in the stylesheet. This component only decides WHEN.
 *
 * ## Three things a naive version does not do
 *
 *   1. Removes `no-js` from the document element on mount. The stylesheet keeps
 *      every `.reveal` fully visible while that class is present, so a page
 *      whose JavaScript never runs shows all its content rather than hiding it
 *      forever. A landing page that blanks itself on a slow connection is worse
 *      than one with no animation.
 *   2. Unobserves after the first reveal. Nothing re-hides on scroll up.
 *   3. Respects `prefers-reduced-motion` through the token file, where the
 *      reveal duration drops to zero, so this needs no branch of its own.
 */

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * rise    prose and paragraphs: a short lift, the quietest of the five
 * lift    artifacts and panels: further, with a touch of scale, so an object
 *         with a shadow reads as settling onto the page rather than sliding
 * mask    a block wiped up from behind its own bottom edge
 * words   section headers, where the text arrives rather than the box: the
 *         label's tracking settles, the headline builds a word at a time, and
 *         the paragraph resolves out of blur
 * stagger lists and card rows: children arrive in sequence, not as a slab
 */
type RevealVariant = "rise" | "lift" | "mask" | "words" | "stagger";

export function RevealOnScroll(props: {
  children: ReactNode;
  delayMs?: number;
  variant?: RevealVariant;
  /**
   * Merged onto the reveal element itself. The stagger variant animates its own
   * direct children, so a grid that needs staggering should BE this element
   * rather than sit inside it: passing `pair-rows` here is what makes the rows
   * siblings of the reveal rather than grandchildren of it.
   */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    document.documentElement.classList.remove("no-js");

    const element = ref.current;
    if (element === null) return;

    if (typeof IntersectionObserver === "undefined") {
      element.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      /*
       * The delay is a custom property rather than `transitionDelay`, because
       * the stagger variant has to add each child's own offset on top of it and
       * an inline transition-delay would sit on the wrapper where no child can
       * reach it.
       */
      className={`reveal reveal-${props.variant ?? "rise"}${
        props.className === undefined ? "" : ` ${props.className}`
      }`}
      style={
        props.delayMs === undefined
          ? undefined
          : ({ "--reveal-delay": `${props.delayMs}ms` } as CSSProperties)
      }
    >
      {props.children}
    </div>
  );
}
