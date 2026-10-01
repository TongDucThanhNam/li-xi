"use client";

import { Disclosure } from "@heroui/react";
import type { ReactNode } from "react";

/**
 * Collapsible block inside a section (or, with `bare`, a whole section).
 * Collapsed content stays mounted so field state survives collapsing.
 */
export function AdminDisclosure({
	bare = false,
	children,
	defaultExpanded = false,
	summary,
	title,
}: {
	bare?: boolean;
	children: ReactNode;
	defaultExpanded?: boolean;
	summary?: string;
	title: string;
}) {
	return (
		<Disclosure className={bare ? "admin-disclosure admin-disclosure--bare" : "admin-disclosure"} defaultExpanded={defaultExpanded}>
			<Disclosure.Heading>
				<Disclosure.Trigger className="admin-disclosure__trigger">
					{/* One wrapping box: below sm the summary sits under the title,
					    from sm beside it (§7.8.5). */}
					<span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
						<span>{title}</span>
						{summary ? <span className="admin-disclosure__summary">{summary}</span> : null}
					</span>
					<Disclosure.Indicator />
				</Disclosure.Trigger>
			</Disclosure.Heading>
			<Disclosure.Content>
				<Disclosure.Body className="admin-disclosure__body">{children}</Disclosure.Body>
			</Disclosure.Content>
		</Disclosure>
	);
}
