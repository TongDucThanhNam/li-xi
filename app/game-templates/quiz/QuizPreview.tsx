"use client";

import {
	isQuizGameConfig,
	quizDefaultGameConfig,
	type CampaignGameConfig,
} from "@/lib/gameTemplates";

/**
 * Deterministic operator preview: first-question presentation with choice
 * cards and the pass rule — never the answer key.
 */
export function QuizPreview({
	config,
}: {
	config: CampaignGameConfig;
	heroUrl?: string | null;
}) {
	const quizConfig = isQuizGameConfig(config)
		? config
		: { ...quizDefaultGameConfig, publicCopy: config.publicCopy };
	const first = quizConfig.questions[0];
	return (
		<section
			aria-label="Xem trước trắc nghiệm tri ân"
			className="relative isolate aspect-video max-w-2xl overflow-hidden rounded-2xl p-6 text-center shadow-inner"
			style={{ background: "#12203a", color: "#f2f7ff" }}
		>
			<div className="grid h-full place-content-center gap-3">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#4f7cff]">
					Trắc nghiệm tri ân
				</p>
				<h3 className="text-2xl font-bold text-[#f2f7ff]">
					{quizConfig.publicCopy.headline || "Trả lời câu hỏi nhận quà tri ân"}
				</h3>
				{first ? (
					<div
						className="mx-auto w-full max-w-md rounded-xl border border-white/15 bg-white/5 p-3 text-left"
						data-testid="quiz-preview-card"
					>
						<p className="text-sm font-semibold">{first.prompt || "Câu hỏi mẫu"}</p>
						<div className="mt-2 grid gap-1">
							{first.choices.map((choice, index) => (
								<span
									className="rounded-lg bg-white/10 px-3 py-1 text-xs"
									key={index}
								>
									{choice || `Lựa chọn ${index + 1}`}
								</span>
							))}
						</div>
					</div>
				) : null}
				<p className="text-sm text-[#f2f7ff]/75">
					{quizConfig.questions.length} câu hỏi · đạt tối thiểu{" "}
					{quizConfig.passCount} câu
				</p>
				<span className="mx-auto mt-2 rounded-full bg-[#4f7cff] px-6 py-2 text-sm font-bold text-[#f2f7ff]">
					{quizConfig.publicCopy.startCtaLabel || "Bắt đầu"}
				</span>
			</div>
		</section>
	);
}
