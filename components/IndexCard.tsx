import type { HTMLAttributes, ReactNode } from "react";

// A ruled 3 x 5 index card: the object everything in the app is filed on.
// The heading band above the red rule holds typed labels; the body text sits
// on the blue rules (see .index-card in globals.css).

interface Props extends HTMLAttributes<HTMLElement> {
  head?: ReactNode;
  aside?: ReactNode;
  size?: "large" | "small";
  as?: "div" | "li" | "section";
  // Unruled space at the foot of the card, for a button.
  footer?: ReactNode;
  children: ReactNode;
}

export function IndexCard({
  head,
  aside,
  size = "large",
  as: Tag = "div",
  className = "",
  footer,
  children,
  ...rest
}: Props) {
  const sizeClass =
    (size === "small" ? " index-card--small" : "") +
    (footer ? " index-card--footed" : "");
  return (
    <Tag className={`index-card${sizeClass} ${className}`} {...rest}>
      <div className="index-card__head">
        <span className="min-w-0 truncate">{head}</span>
        {aside && <span className="shrink-0">{aside}</span>}
      </div>
      <div className="index-card__body">{children}</div>
      {footer && (
        <div className="rounded-b-box bg-stock px-[var(--pad-x)] pt-2 pb-6">
          {footer}
        </div>
      )}
    </Tag>
  );
}

/** Up to two cards peeking out from under the top one: what is left to go. */
export function CardStack({
  under,
  children,
}: {
  under: number;
  children: ReactNode;
}) {
  return (
    <div className="card-stack">
      {Array.from({ length: Math.min(2, Math.max(0, under)) }, (_, i) => (
        <div key={i} aria-hidden className="card-stack__under" />
      ))}
      {children}
    </div>
  );
}
