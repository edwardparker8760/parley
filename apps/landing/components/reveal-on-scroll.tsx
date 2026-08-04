"use client";

/**
 * Gentle fade and rise as a section enters the viewport.
 *
 * Three things this does that a naive version does not:
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
import type { ReactNode } from "react";

export function RevealOnScroll(props: { children: ReactNode; delayMs?: number }) {
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
      className="reveal"
      style={props.delayMs === undefined ? undefined : { transitionDelay: `${props.delayMs}ms` }}
    >
      {props.children}
    </div>
  );
}
