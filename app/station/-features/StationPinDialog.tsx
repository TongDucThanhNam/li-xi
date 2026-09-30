"use client";

import { useRef, useState } from "react";
import { PIN_LENGTH } from "@/lib/lixiPolicy";

/**
 * Shell-owned Host PIN dialog shared by the station exit and the
 * result-dismissal path. One focus/trap/Escape implementation: the field
 * auto-focuses, Tab wraps inside the dialog, Escape cancels (focus
 * restoration stays the caller's job through onClose), and submit forwards
 * the entered PIN to the caller's verifier.
 */
export function StationPinDialog({
	ids,
	title,
	description,
	submitLabel,
	cancelLabel,
	error,
	onSubmit,
	onClose,
}: {
	/** Stable DOM ids (dialog is mounted once per screen at a time). */
	ids: {
		title: string;
		description: string;
		input: string;
		error: string;
	};
	title: string;
	description: string;
	submitLabel: string;
	cancelLabel: string;
	error: string;
	onSubmit: (pin: string) => Promise<void>;
	onClose: () => void;
}) {
	const dialogRef = useRef<HTMLFormElement>(null);
	const [pin, setPin] = useState("");
	const [submitting, setSubmitting] = useState(false);

	return (
		<div className="station-overlay">
			<form
				aria-describedby={ids.description}
				aria-labelledby={ids.title}
				aria-modal="true"
				className="station-dialog"
				ref={dialogRef}
				role="dialog"
				onKeyDown={(event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						onClose();
						return;
					}
					if (event.key !== "Tab") return;
					const focusable = Array.from(
						dialogRef.current?.querySelectorAll<HTMLElement>(
							'input:not([disabled]), button:not([disabled])',
						) ?? [],
					);
					const first = focusable[0];
					const last = focusable.at(-1);
					if (!first || !last) return;
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				}}
				onSubmit={async (event) => {
					event.preventDefault();
					if (submitting) return;
					setSubmitting(true);
					try {
						await onSubmit(pin);
					} finally {
						setSubmitting(false);
					}
				}}
			>
				<h2 className="station-dialog__title" id={ids.title}>{title}</h2>
				<p className="station-dialog__description" id={ids.description}>
					{description}
				</p>
				<label className="station-dialog__label" htmlFor={ids.input}>Host PIN</label>
				<input
					autoFocus
					className="station-dialog__input"
					id={ids.input}
					inputMode="numeric"
					maxLength={PIN_LENGTH}
					aria-describedby={error ? ids.error : undefined}
					aria-invalid={Boolean(error)}
					onChange={(event) =>
						setPin(event.currentTarget.value.replace(/\D/g, "").slice(0, PIN_LENGTH))
					}
					type="password"
					value={pin}
				/>
				{error ? (
					<p className="station-dialog__error" id={ids.error} role="alert">{error}</p>
				) : null}
				<div className="station-dialog__actions">
					<button
						className="station-dialog__submit"
						disabled={pin.length !== PIN_LENGTH || submitting}
						type="submit"
					>
						{submitLabel}
					</button>
					<button className="station-dialog__cancel" onClick={onClose} type="button">
						{cancelLabel}
					</button>
				</div>
			</form>
		</div>
	);
}
