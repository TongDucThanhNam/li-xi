"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scaled live-preview frame (workspace UX redesign §7.1): the preview
 * component renders at a fixed 640px logical width — the width its 16:9
 * section is designed for — and is scaled down to the available width, so
 * narrow columns see the whole stage instead of a clipped reflow. Never
 * upscales above 1.
 */
const BASE_WIDTH = 640;
const BASE_HEIGHT = (BASE_WIDTH * 9) / 16;

export function GamePreviewFrame({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;
		const update = () => setScale(Math.min(1, node.clientWidth / BASE_WIDTH));
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	return (
		<div className="admin-preview-frame" ref={ref} style={{ height: BASE_HEIGHT * scale }}>
			<div
				className="admin-preview-frame__stage"
				style={{ transform: `scale(${scale})`, width: BASE_WIDTH }}
			>
				{children}
			</div>
		</div>
	);
}
