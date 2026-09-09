"use client";

import { Link } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function GameRouteError({
	reset,
	showWorkspaceLink = false,
}: {
	error: Error;
	reset: () => void;
	showWorkspaceLink?: boolean;
}) {
	return (
		<main className="relative grid min-h-dvh place-items-center overflow-hidden bg-black-ink p-6 text-gold-shine">
			<div className="absolute inset-0 bg-linear-to-br from-red-deep/65 via-black-ink to-black-ink" />
			<section className="relative z-10 grid w-full max-w-md justify-items-center rounded-2xl border border-gold-base/30 bg-red-deep/70 p-7 text-center shadow-2xl">
				<span className="grid size-12 place-items-center rounded-full border border-red-vivid/40 bg-red-vivid/10 text-red-vivid">
					<AlertTriangle aria-hidden="true" size={22} />
				</span>
				<h1 className="mt-4 font-cinzel text-2xl">Không thể tải trò chơi</h1>
				<p className="mt-3 font-vn text-sm leading-6 text-gold-shine/70">
					Kết nối hoặc dữ liệu trò chơi đang tạm thời chưa khả dụng. Hãy thử lại.
				</p>
				<div className="mt-6 flex flex-wrap justify-center gap-3">
					<button
						className="mag-btn inline-flex items-center gap-2"
						onClick={reset}
						type="button"
					>
						<RefreshCw aria-hidden="true" size={16} />
						Thử lại
					</button>
					{showWorkspaceLink ? (
						<Link
							className="inline-flex items-center rounded-full border border-gold-base/50 px-5 py-2 font-vn text-sm"
							to="/campaigns"
						>
							Quay lại Campaign Studio
						</Link>
					) : null}
				</div>
			</section>
		</main>
	);
}
