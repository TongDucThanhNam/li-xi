"use client";

import { Input, Label, NumberField, TextArea, Button } from "@heroui/react";
import { GamePublicCopyFields, type GamePublicCopyFieldKey } from "../GamePublicCopyFields";
import { NativeSelect, Widget } from "@heroui-pro/react";
import { AdminDisclosure } from "@/app/components/AdminDisclosure";
import { Plus, Trash2 } from "lucide-react";
import type { GameConfigEditorProps } from "../types";
import {
	assertQuizGameConfigIntegrity,
	buildQuizGameConfig,
	DEFAULT_REWARD_POOL_TAG,
	isQuizGameConfig,
	QUIZ_MAX_CHOICES,
	QUIZ_MAX_QUESTIONS,
	quizDefaultGameConfig,
	REWARD_MODE_LABELS,
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
	section,
}: GameConfigEditorProps) {
	const quizConfig = isQuizGameConfig(config)
		? config
		: buildQuizGameConfig({ ...quizDefaultGameConfig, publicCopy: config.publicCopy });
	const update = (next: Partial<typeof quizConfig>) =>
		onChange(buildQuizGameConfig({ ...quizConfig, ...next }));
	const updateCopy = (key: GamePublicCopyFieldKey, value: string) =>
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

	if (section === "content") {
		return (
			<Widget>
				<Widget.Header>
					<Widget.Title>Nội dung trải nghiệm</Widget.Title>
					<Widget.Description>Nội dung này xuất hiện trên liên kết chơi công khai.</Widget.Description>
				</Widget.Header>
				<Widget.Content className="admin-form">
					<GamePublicCopyFields
						copy={quizConfig.publicCopy}
						idPrefix="quiz"
						onChange={updateCopy}
					/>
				</Widget.Content>
			</Widget>
		);
	}

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
				<Widget.Content className="admin-form">
					<div className="admin-field">
						<Label htmlFor="quiz-reward-mode">Chế độ thưởng</Label>
						<NativeSelect className="admin-control--sm" fullWidth variant="secondary">
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
							<NumberField.Group className="admin-control--xs">
								<NumberField.DecrementButton aria-label="Giảm số câu đạt tối thiểu" />
								<NumberField.Input />
								<NumberField.IncrementButton aria-label="Tăng số câu đạt tối thiểu" />
							</NumberField.Group>
						</NumberField>
						<p className="admin-field__hint">
							Đạt tối thiểu số câu này để đủ điều kiện nhận phần thưởng.
						</p>
					</div>
					<AdminDisclosure
						defaultExpanded={quizConfig.rewardPoolTag !== DEFAULT_REWARD_POOL_TAG}
						summary={`Nhóm kho: ${quizConfig.rewardPoolTag}`}
						title="Tuỳ chọn nâng cao"
					>
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
							<p className="admin-field__hint">
								Khớp "Nhóm kho" của các phần thưởng trong kho dùng chung.
							</p>
						</div>
					</AdminDisclosure>
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
				<Widget.Content className="admin-stack">
					{quizConfig.questions.map((question, questionIndex) => (
						<div className="admin-stack rounded-xl border border-border p-4" key={questionIndex}>
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
								onChange={(event) =>
									setQuestion(questionIndex, {
										...question,
										prompt: event.currentTarget.value,
									})
								}
							/>
							<p className="admin-group-label">
								Lựa chọn <span className="normal-case">· chọn đáp án đúng</span>
							</p>
							{question.choices.map((choice, choiceIndex) => (
								<div className="flex items-center gap-2" key={choiceIndex}>
									<input
										aria-label={`Đáp án đúng của câu ${questionIndex + 1}: lựa chọn ${choiceIndex + 1}`}
										checked={question.correctIndex === choiceIndex}
										className="size-4 shrink-0"
										name={`quiz-correct-${questionIndex}`}
										style={{ accentColor: "var(--accent)" }}
										type="radio"
										onChange={() =>
											setQuestion(questionIndex, {
												...question,
												correctIndex: choiceIndex,
											})
										}
									/>
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
							<div className="admin-field">
								<Label htmlFor={`quiz-explanation-${questionIndex}`}>
									Giải thích (tuỳ chọn)
								</Label>
								<TextArea
									fullWidth
									id={`quiz-explanation-${questionIndex}`}
									value={question.explanation ?? ""}
									variant="secondary"
									onChange={(event) =>
										setQuestion(questionIndex, {
											...question,
											explanation: event.currentTarget.value,
										})
									}
								/>
								<p className="admin-field__hint">Hiện sau khi người chơi hoàn thành.</p>
							</div>
						</div>
					))}
					{quizConfig.questions.length < QUIZ_MAX_QUESTIONS ? (
						<Button onPress={addQuestion} variant="secondary">
							<Plus aria-hidden="true" size={15} />
							Thêm câu hỏi
						</Button>
					) : null}
					{validity ? (
						<p className="text-sm text-danger" role="alert">
							Cấu hình hiện tại chưa thể lưu: {validity}
						</p>
					) : null}
					</Widget.Content>
				</Widget>
		</div>
	);
}
