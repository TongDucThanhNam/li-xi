"use client";

import { Radio, RadioGroup } from "@heroui/react";
import {
	gameTemplates,
	type GameTemplateId,
} from "@/lib/gameTemplates";
import { GameTemplateIcon } from "./GameTemplateIcon";

/** One-line blurbs shown under each template name in the picker. */
const templateBlurbs: Record<GameTemplateId, string> = {
	"li-xi": "Lì xì phong bao đỏ/vàng, phù hợp chiến dịch Tết và tri ân cuối năm.",
	"lucky-wheel": "Vòng quay nhiều ô với kho phần thưởng đa dạng, chơi tự phục vụ qua link.",
	"scratch-card": "Thẻ cào gỡ lớp phủ với phần thưởng công bố một lần bởi máy chủ.",
	"slot-reveal": "Ba cuộn máy quay với biểu tượng ổn định; máy chủ ghép tổ hợp phần thưởng một lần duy nhất.",
	quiz: "Trắc nghiệm nhiều câu hỏi chấm điểm máy chủ; đạt điểm mới nhận phần thưởng.",
};

/** Radio-card grid of the registered game templates (catalog only). */
export function GameTemplatePicker({
	columns = 2,
	onChange,
	value,
}: {
	/** 1 for narrow dialogs, 2 (default) for full-width forms. */
	columns?: 1 | 2;
	onChange: (templateId: GameTemplateId) => void;
	value: GameTemplateId;
}) {
	return (
		<RadioGroup
			className={columns === 1 ? "admin-choice-grid admin-choice-grid--single" : "admin-choice-grid"}
			value={value}
			onChange={(next) => onChange(next as GameTemplateId)}
		>
			{Object.values(gameTemplates).map((template) => {
				const selected = template.id === value;
				return (
					<Radio
						aria-label={`Chọn mẫu ${template.name}`}
						className={`admin-choice-card ${selected ? "border-accent bg-accent-soft" : "hover:border-accent/50"}`}
						key={template.id}
						value={template.id}
					>
						<Radio.Content>
							<Radio.Control>
								<Radio.Indicator />
							</Radio.Control>
							<span className="admin-icon-tile">
								<GameTemplateIcon templateId={template.id} />
							</span>
							<span className="min-w-0">
								<span className="block text-sm font-medium text-foreground">{template.name}</span>
								<span className="mt-0.5 block text-xs leading-4 text-muted">
									{templateBlurbs[template.id]}
								</span>
							</span>
						</Radio.Content>
					</Radio>
				);
			})}
		</RadioGroup>
	);
}
