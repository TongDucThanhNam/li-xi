"use client";

import { useEffect, useState } from "react";

const VARS_TO_CHECK = [
	"--color-gold-shine",
	"--color-gold-base",
	"--color-red-deep",
	"--color-red-vivid",
	"--color-black-ink",
	"--color-liner-dark",
	"--color-text-primary",
	"--text-primary", // The broken one
];

export default function CssDebugger() {
	const [report, setReport] = useState<Record<string, string>>({});
	const [visible, setVisible] = useState(false); // Hidden by default, toggle with Ctrl+Shift+D or generic

	useEffect(() => {
		const checkVars = () => {
			const computed = getComputedStyle(document.documentElement);
			const nextReport: Record<string, string> = {};
			VARS_TO_CHECK.forEach((v) => {
				nextReport[v] = computed.getPropertyValue(v).trim() || "UNDEFINED";
			});
			setReport(nextReport);
		};

		// Check immediately and on interval
		checkVars();
		const interval = setInterval(checkVars, 2000);

		const handler = (e: KeyboardEvent) => {
			if (e.ctrlKey && e.shiftKey && e.key === "D") {
				setVisible((prev) => !prev);
			}
		};
		window.addEventListener("keydown", handler);

		return () => {
			clearInterval(interval);
			window.removeEventListener("keydown", handler);
		};
	}, []);

	if (!visible)
		return (
			<div
				className="fixed bottom-1 right-1 text-[10px] text-white/20 z-[9999]"
				onClick={() => setVisible(true)}
			>
				Debug CSS (Ctrl+Shift+D)
			</div>
		);

	return (
		<div className="fixed top-4 right-4 z-[9999] bg-black/90 text-white p-4 rounded border border-red-500 font-mono text-xs max-w-sm shadow-xl">
			<div className="flex justify-between items-center mb-2">
				<h3 className="font-bold text-yellow-500">CSS Variable Debugger</h3>
				<button
					onClick={() => setVisible(false)}
					className="text-red-400 hover:text-red-300"
				>
					[x]
				</button>
			</div>
			<div className="space-y-1">
				{Object.entries(report).map(([key, val]) => (
					<div
						key={key}
						className="flex justify-between gap-4 border-b border-white/10 pb-0.5"
					>
						<span
							className={
								val === "UNDEFINED" ? "text-red-400 font-bold" : "text-gray-400"
							}
						>
							{key}
						</span>
						<span
							className="text-right truncate max-w-[150px]"
							style={{ color: val !== "UNDEFINED" ? val : undefined }}
						>
							{val}
						</span>
					</div>
				))}
			</div>
			<div className="mt-2 text-[10px] text-gray-500">
				Computed from document.documentElement
			</div>
		</div>
	);
}
