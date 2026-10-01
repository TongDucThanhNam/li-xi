import { Input, Label, TextArea } from "@heroui/react";
import {
	PUBLIC_COPY_BOUNDS,
	type GamePublicCopy,
} from "@/lib/gameTemplates";

export type GamePublicCopyFieldKey = keyof GamePublicCopy;

const COPY_FIELD_LABELS: Record<GamePublicCopyFieldKey, string> = {
	headline: "Tiêu đề",
	subtitle: "Mô tả ngắn",
	startCtaLabel: "Nút bắt đầu",
	collectCtaLabel: "Nút nhận kết quả",
	waitingMessage: "Thông điệp chờ",
	thankYouMessage: "Thông điệp cảm ơn",
	claimInstructions: "Hướng dẫn nhận thưởng",
};

const COPY_FIELD_HINTS: Partial<Record<GamePublicCopyFieldKey, string>> = {
	thankYouMessage: "Hiển thị khi người chơi hoàn tất lượt chơi. Bỏ trống dùng thông điệp mặc định.",
	claimInstructions: "Hiển thị cùng mã phần thưởng voucher. Bỏ trống dùng hướng dẫn mặc định.",
};

/**
 * The full 7-field guest-copy section shared by every template's config
 * editor: one Vietnamese label set, one bound source (PUBLIC_COPY_BOUNDS —
 * the same bounds the server normalizer enforces), and a live character
 * counter per field.
 */
export function GamePublicCopyFields({
	copy,
	idPrefix,
	onChange,
}: {
	copy: GamePublicCopy;
	idPrefix: string;
	onChange: (key: GamePublicCopyFieldKey, value: string) => void;
}) {
	const field = (key: GamePublicCopyFieldKey) => {
		const label = COPY_FIELD_LABELS[key];
		const hint = COPY_FIELD_HINTS[key];
		const max = PUBLIC_COPY_BOUNDS[key];
		const value = copy[key] ?? "";
		const counter = `${value.length}/${max}`;
		const input = key === "subtitle" || key === "claimInstructions"
			? (
					<TextArea
						fullWidth
						id={`${idPrefix}-${key}`}
						maxLength={max}
						value={value}
						variant="secondary"
						onChange={(event) => onChange(key, event.currentTarget.value)}
					/>
				)
			: (
					<Input
						className={key === "startCtaLabel" || key === "collectCtaLabel" ? "admin-control--sm" : undefined}
						fullWidth
						id={`${idPrefix}-${key}`}
						maxLength={max}
						value={value}
						variant="secondary"
						onChange={(event) => onChange(key, event.currentTarget.value)}
					/>
				);
		return (
			<div className="admin-field">
				<div className="admin-field__label-row">
					<Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
					<span className="admin-field__counter">{counter}</span>
				</div>
				{input}
				{hint ? <p className="admin-field__hint">{hint}</p> : null}
			</div>
		);
	};

	return (
		<div className="flex flex-col gap-6">
			<div className="admin-stack">
				<p className="admin-group-label">Màn mở đầu</p>
				{field("headline")}
				{field("subtitle")}
				{field("startCtaLabel")}
			</div>
			<div className="admin-stack">
				<p className="admin-group-label">Trong lúc chờ</p>
				{field("waitingMessage")}
			</div>
			<div className="admin-stack">
				<p className="admin-group-label">Kết quả</p>
				{field("collectCtaLabel")}
				{field("thankYouMessage")}
				{field("claimInstructions")}
			</div>
		</div>
	);
}
