import Link from "next/link";
import type { ReactNode } from "react";
import { IndexCard } from "@/components/IndexCard";

/** The action that fills every empty drawer: go and capture something. */
export const CAPTURE_ACTION = { href: "/", label: "Capture something" };

// An empty drawer: one blank index card that says what will be filed here,
// with the one action that fills it.
export function EmptyCard({
  head,
  children,
  action,
  ...rest
}: {
  head: string;
  children: ReactNode;
  action?: { href: string; label: string };
  "data-testid"?: string;
}) {
  return (
    <IndexCard
      head={head}
      className="max-w-[760px]"
      footer={
        action && (
          <Link href={action.href} className="btn btn-primary">
            {action.label}
          </Link>
        )
      }
      {...rest}
    >
      <p className="text-ink-2">{children}</p>
    </IndexCard>
  );
}
