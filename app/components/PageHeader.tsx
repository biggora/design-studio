import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  /** Lead paragraph under the H1; its presence tightens the H1 margin. */
  intro?: ReactNode;
  /** id for aria-labelledby sections (e.g. the home heading). */
  id?: string;
  className?: string;
  introClassName?: string;
};

/**
 * Page H1 (DESIGN.md "Headline" role) with optional lead paragraph: H1 gets
 * 32px clearance alone, 16px before its intro, and the intro leaves 32px.
 */
export function PageHeader({ title, intro, id, className, introClassName }: PageHeaderProps) {
  return (
    <>
      <h1
        id={id}
        className={cn(
          "font-display text-4xl font-bold tracking-[-0.02em] text-foreground",
          intro ? "mb-4" : "mb-8",
          className,
        )}
      >
        {title}
      </h1>
      {intro != null && intro !== "" && (
        <p className={cn("text-muted-foreground max-w-3xl mb-8", introClassName)}>
          {intro}
        </p>
      )}
    </>
  );
}
