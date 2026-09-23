"use client";

import { Description, Input, Label, NumberField, TextArea, Button } from "@heroui/react";
import { NativeSelect, Widget } from "@heroui-pro/react";
import { Plus, Trash2 } from "lucide-react";
import {
	assertQuizGameConfigIntegrity,
	buildQuizGameConfig,
	isQuizGameConfig,
	QUIZ_MAX_CHOICES,
	QUIZ_MAX_QUESTIONS,
	quizDefaultGameConfig,
	REWARD_MODE_LABELS,
	type CampaignGameConfig,
	type GameRewardMode,
	type QuizQuestionConfig,
} from "@/lib/gameTemplates";

/**
 * Bounded quiz operator editor: add/edit/remove questions and choices, mark
 * the single correct choice, set the passing count, and save/revert through
 * the shared editor draft flow. Structural validity is enforced at save time
 * by `assertQuizGameConfigIntegrity` (surfaced through the save error).
 */
export function QuizConfigEditor({
	config,
	onChange,
}: {
	config: CampaignGameConfig;
	onChange: (config: CampaignGameConfig) => void;
}) {
	const quizConfig = isQuizGameConfig(config)
		? config
		: { ...quizDefaultGameConfig, publicCopy: config.publicCopy };
	const update = (next: Partial<typeof quizConfig>) =>
		onChange(buildQuizGameConfig({ ...quizConfig, ...next }));
	const updateCopy = (key: "headline" | "subtitle", value: string) =>
		onChange({ ...quizConfig, publicCopy: { ...quizConfig.publicCopy, [key]: value } });

	const setQuestion = (index: number, question: QuizQuestionConfig) => {
		const questions = quizConfig.questions.map((entry, entryIndex) =>
			entryIndex === index ? question : entry,
		);
		update({
			questions,
			passCount: Math.min(quizConfig.passCount, questions.length),
		});
	};
	const addQuestion = () => {
		if (quizConfig.questions.length >= QUIZ_MAX_QUESTIONS) return;
		update({
			questions: [
				...quizConfig.questions,
				{ prompt: "", choices: ["", ""], correctIndex: 0 },
			],
			passCount: quizConfig.passCount,
		});
	};
	const removeQuestion = (index: number) => {
		if (quizConfig.questions.length <= 1) return;
		const questions = quizConfig.questions.filter((_, entryIndex) => entryIndex !== index);
		update({
			questions,
			passCount: Math.min(quizConfig.passCount, questions.length),
		});
	};

	const validity = (() => {
		try {
			assertQuizGameConfigIntegrity(quizConfig);
			return null;
		} catch (unknownError) {
			return unknownError instanceof Error ? unknownError.message : "Cấu hình chưa hợp lệ";
		}
	})();

	return (
		<div className="grid gap-6">
			<Widget>
				<Widget.Header>
					<Widget.Title>Trắc nghiệm tri ân</Widget.Title>
					<Widget.Description>
						Đáp án và giải thích là thông tin riêng tư: máy chủ chấm điểm và
						chỉ hiển thị đáp án sau khi hoàn thành.
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field">
						<Label htmlFor="quiz-reward-mode">Chế độ thưởng</Label>
						<NativeSelect fullWidth variant="secondary">
							<NativeSelect.Trigger
								aria-label="Chế độ thưởng"
								id="quiz-reward-mode"
								value={quizConfig.rewardMode}
								onChange={(event) =>
									update({
										rewardMode: event.currentTarget.value as GameRewardMode,
									})
								}
							>
								<NativeSelect.Option value="rewarded">
									{REWARD_MODE_LABELS.rewarded}
								</NativeSelect.Option>
								<NativeSelect.Option value="engagement">
									{REWARD_MODE_LABELS.engagement}
								</NativeSelect.Option>
								<NativeSelect.Indicator />
							</NativeSelect.Trigger>
						</NativeSelect>
					</div>
					<div className="admin-field">
						<NumberField
							fullWidth
							maxValue={quizConfig.questions.length}
							minValue={1}
							step={1}
							value={quizConfig.passCount}
							variant="secondary"
							onChange={(value) =>
								update({ passCount: Number.isFinite(value) ? value : quizConfig.passCount })
							}
						>
							<Label>Số câu đạt tối thiểu (1-{quizConfig.questions.length})</Label>
							<NumberField.Group>
								<NumberField.DecrementButton aria-label="Giảm số câu đạt tối thiểu" />
								<NumberField.Input />
								<NumberField.IncrementButton aria-label="Tăng số câu đạt tối thiểu" />
							</NumberField.Group>
						</NumberField>
						<Description>
							Đạt tối thiểu số câu này để đủ điều kiện nhận phần thưởng.
						</Description>
					</div>
					<div className="admin-field">
						<Label htmlFor="quiz-no-reward-label">Nhãn lượt chưa đạt</Label>
						<Input
							fullWidth
							id="quiz-no-reward-label"
							value={quizConfig.noRewardLabel}
							variant="secondary"
							onChange={(event) => update({ noRewardLabel: event.currentTarget.value })}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="quiz-pool-tag">Nhóm kho phần thưởng</Label>
						<Input
							fullWidth
							id="quiz-pool-tag"
							value={quizConfig.rewardPoolTag}
							variant="secondary"
							onChange={(event) => update({ rewardPoolTag: event.currentTarget.value })}
						/>
						<Description>
							Khớp "Nhóm kho" của các phần thưởng trong kho dùng chung.
						</Description>
					</div>
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header>
					<Widget.Title>
						Câu hỏi ({quizConfig.questions.length}/{QUIZ_MAX_QUESTIONS})
					</Widget.Title>
					<Widget.Description>
						Mỗi câu hỏi có một lựa chọn đúng; người chơi trả lời theo thứ tự.
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					{quizConfig.questions.map((question, questionIndex) => (
						<div className="admin-field quiz-editor__question" key={questionIndex}>
							<div className="flex items-center justify-between gap-2">
								<Label htmlFor={`quiz-prompt-${questionIndex}`}>
									Câu hỏi {questionIndex + 1}
								</Label>
								<Button
									aria-label={`Xóa câu hỏi ${questionIndex + 1}`}
									isDisabled={quizConfig.questions.length <= 1}
									onPress={() => removeQuestion(questionIndex)}
									size="sm"
									variant="ghost"
								>
									<Trash2 aria-hidden="true" size={14} />
									Xóa câu
								</Button>
							</div>
							<TextArea
								fullWidth
								id={`quiz-prompt-${questionIndex}`}
								value={question.prompt}
								variant="secondary"
								onChange={(value) => setQuestion(questionIndex, { ...question, prompt: value })}
							/>
							{question.choices.map((choice, choiceIndex) => (
								<div className="flex items-end gap-2" key={choiceIndex}>
									<NativeSelect
										aria-label={`Lựa chọn đúng cho câu ${questionIndex + 1}`}
										variant="secondary"
									>
										<NativeSelect.Trigger
											aria-label={`Lựa chọn đúng cho câu ${questionIndex + 1}`}
											value={String(question.correctIndex === choiceIndex)}
											onChange={() =>
												setQuestion(questionIndex, {
													...question,
													correctIndex: choiceIndex,
												})
											}
										>
											<NativeSelect.Option value="true">Đúng</NativeSelect.Option>
											<NativeSelect.Option value="false">—</NativeSelect.Option>
											<NativeSelect.Indicator />
										</NativeSelect.Trigger>
									</NativeSelect>
									<Input
										aria-label={`Lựa chọn ${choiceIndex + 1} của câu ${questionIndex + 1}`}
										fullWidth
										value={choice}
										variant="secondary"
										onChange={(event) =>
											setQuestion(questionIndex, {
												...question,
												choices: question.choices.map((entry, choiceEntryIndex) =>
													choiceEntryIndex === choiceIndex
														? event.currentTarget.value
														: entry,
												),
											})
										}
									/>
									<Button
										aria-label={`Xóa lựa chọn ${choiceIndex + 1} của câu ${questionIndex + 1}`}
										isDisabled={question.choices.length <= 2}
										onPress={() =>
											setQuestion(questionIndex, {
												...question,
												choices: question.choices.filter(
													(_, choiceEntryIndex) => choiceEntryIndex !== choiceIndex,
												),
												correctIndex: 0,
											})
										}
										size="sm"
										variant="ghost"
									>
										<Trash2 aria-hidden="true" size={14} />
									</Button>
								</div>
							))}
							{question.choices.length < QUIZ_MAX_CHOICES ? (
								<Button
									onPress={() =>
										setQuestion(questionIndex, {
											...question,
											choices: [...question.choices, ""],
										})
									}
									size="sm"
									variant="ghost"
								>
									<Plus aria-hidden="true" size={14} />
									Thêm lựa chọn
								</Button>
							) : null}
							<Input
								aria-label={`Giải thích cho câu ${questionIndex + 1} (hiện sau hoàn thành)`}
								fullWidth
								placeholder="Giải thích (hiện sau hoàn thành, tuỳ chọn)"
								value={question.explanation ?? ""}
								variant="secondary"
								onChange={(event) =>
									setQuestion(questionIndex, {
										...question,
										explanation: event.currentTarget.value,
									})
								}
							/>
						</div>
					))}
					{quizConfig.questions.length < QUIZ_MAX_QUESTIONS ? (
						<Button onPress={addQuestion} variant="secondary">
							<Plus aria-hidden="true" size={15} />
							Thêm câu hỏi
						</Button>
					) : null}
					{validity ? (
						<Description>
							Cấu hình hiện tại chưa thể lưu: {validity}
						</Description>
					) : null}
				</Widget.Content>
			</Widget>

			<Widget>
				<Widget.Header>
					<Widget.Title>Nội dung trải nghiệm</Widget.Title>
					<Widget.Description>Nội dung này xuất hiện trên liên kết chơi công khai.</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					<div className="admin-field">
						<Label htmlFor="quiz-headline">Tiêu đề</Label>
						<Input
							fullWidth
							id="quiz-headline"
							value={quizConfig.publicCopy.headline}
							variant="secondary"
							onChange={(event) => updateCopy("headline", event.currentTarget.value)}
						/>
					</div>
					<div className="admin-field">
						<Label htmlFor="quiz-subtitle">Mô tả ngắn</Label>
						<Input
							fullWidth
							id="quiz-subtitle"
							value={quizConfig.publicCopy.subtitle}
							variant="secondary"
							onChange={(event) => updateCopy("subtitle", event.currentTarget.value)}
						/>
					</div>
				</Widget.Content>
			</Widget>
		</div>
	);
}
