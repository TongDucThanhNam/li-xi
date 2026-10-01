"use client";

import { Alert, Button, Input, Label, Modal, Spinner, buttonVariants } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { FileQuestion, Play, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { GamePreviewFrame } from "@/app/_workspace/-components/GamePreviewFrame";
import { GameStatusChip } from "@/app/_workspace/-components/GameStatusChip";
import { GameTemplatePicker } from "@/app/_workspace/-components/GameTemplatePicker";
import { getGameTemplate } from "@/app/game-templates/registry";
import type { GameTemplate } from "@/app/game-templates/types";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { conversionRate, formatPercent } from "@/lib/campaignMetrics";
import {
	gameTemplates as gameTemplateCatalog,
	type CampaignGameConfig,
	type GameTemplateId,
} from "@/lib/gameTemplates";
import { resolveEffectiveGameStatus } from "@/lib/gameStatus";

type CampaignGamesContext = NonNullable<
	FunctionReturnType<typeof api.campaigns.getCampaignGamesRouteContext>
>;
type CampaignGameEntry = CampaignGamesContext["campaignGames"][number];
type GameBreakdownRow = FunctionReturnType<
	typeof api.analytics.getCampaignGameBreakdown
>["rows"][number];

const statusLabels = {
	active: "Đang chạy",
	archived: "Đã lưu trữ",
	draft: "Bản nháp",
} as const;

const viNumberFormat = new Intl.NumberFormat("vi-VN");

export function CampaignSectionFeature({ campaignId }: { campaignId: string }) {
	const context = useQuery(api.campaigns.getCampaignGamesRouteContext, {
		campaignId: campaignId as Id<"campaigns">,
	});
	const breakdown = useQuery(api.analytics.getCampaignGameBreakdown, {
		campaignId: campaignId as Id<"campaigns">,
	});
	const ensureCampaignGame = useMutation(api.campaigns.ensureCampaignGameForRoute);
	const createCampaignGame = useMutation(api.campaignGames.createCampaignGame);
	const [attemptedCampaignId, setAttemptedCampaignId] = useState("");
	const [materializing, setMaterializing] = useState(false);
	const [materializeError, setMaterializeError] = useState("");
	const [addOpen, setAddOpen] = useState(false);
	const [addTemplateId, setAddTemplateId] = useState<GameTemplateId>("lucky-wheel");
	const [addName, setAddName] = useState("");
	const [adding, setAdding] = useState(false);
	const [addError, setAddError] = useState("");
	const [addSuccess, setAddSuccess] = useState("");

	const materializeDefaultGame = useCallback(async () => {
		setAttemptedCampaignId(campaignId);
		setMaterializing(true);
		setMaterializeError("");
		try {
			await ensureCampaignGame({ campaignId: campaignId as Id<"campaigns"> });
		} catch (unknownError) {
			setMaterializeError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể chuẩn bị trò chơi mặc định",
			);
		} finally {
			setMaterializing(false);
		}
	}, [campaignId, ensureCampaignGame]);

	useEffect(() => {
		if (
			!context ||
			context.campaignGames.length > 0 ||
			attemptedCampaignId === campaignId
		) {
			return;
		}
		void materializeDefaultGame();
	}, [attemptedCampaignId, campaignId, context, materializeDefaultGame]);

	const addGame = useCallback(async () => {
		if (!context?.campaign) {
			return;
		}
		setAdding(true);
		setAddError("");
		setAddSuccess("");
		try {
			const template = gameTemplateCatalog[addTemplateId];
			const result = await createCampaignGame({
				campaignId: context.campaign.id,
				config: template.initialCampaignConfig as CampaignGameConfig,
				name: addName || undefined,
				status: "draft",
				templateId: template.id,
			});
			setAddName("");
			setAddOpen(false);
			setAddSuccess(`Đã thêm "${result.name}". Hãy cấu hình và kích hoạt trò chơi.`);
		} catch (unknownError) {
			setAddError(
				unknownError instanceof Error ? unknownError.message : "Không thể thêm trò chơi",
			);
		} finally {
			setAdding(false);
		}
	}, [addName, addTemplateId, context, createCampaignGame]);

	if (context === undefined || breakdown === undefined) {
		return (
			<div className="grid min-h-[50vh] place-items-center" role="status">
				<Spinner aria-label="Đang tải danh sách trò chơi chiến dịch" />
			</div>
		);
	}

	if (!context?.campaign) {
		return (
			<AdminPageShell title="Không tìm thấy chiến dịch">
				<EmptyState>
					<EmptyState.Header>
						<EmptyState.Media variant="icon">
							<FileQuestion aria-hidden="true" />
						</EmptyState.Media>
						<EmptyState.Title>Không thể mở danh sách trò chơi</EmptyState.Title>
						<EmptyState.Description>
							Chiến dịch không tồn tại hoặc bạn không có quyền truy cập.
						</EmptyState.Description>
					</EmptyState.Header>
					<EmptyState.Content>
						<Link to="/campaigns">Quay lại danh sách chiến dịch</Link>
					</EmptyState.Content>
				</EmptyState>
			</AdminPageShell>
		);
	}

	const { campaign, campaignGames } = context;
	const campaignStatus = statusLabels[campaign.status];
	const rowsByGameId = new Map(
		breakdown.rows.map((row) => [row.campaignGameId, row]),
	);

	return (
		<AdminPageShell
			actions={
				<Button onPress={() => setAddOpen(true)}>
					<Plus aria-hidden="true" size={16} />
					Thêm trò chơi
				</Button>
			}
			breadcrumbContext={campaign.name}
			description="Mỗi trò chơi là một trải nghiệm độc lập thuộc chiến dịch, với cấu hình và trạng thái riêng."
			tabs={<CampaignContextNav campaignId={campaignId} />}
			title="Trò chơi chiến dịch"
		>
			{campaign.status === "active" ? null : (
				<Alert status="warning">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Chiến dịch đang ở trạng thái {campaignStatus}</Alert.Title>
						<Alert.Description>
							Người chơi chưa thể tham gia cho đến khi chiến dịch được kích hoạt.
						</Alert.Description>
					</Alert.Content>
					<Link
						className={buttonVariants({ size: "sm", variant: "secondary" })}
						params={{ campaignId }}
						to="/campaigns/$campaignId/settings"
					>
						Mở cài đặt
					</Link>
				</Alert>
			)}

			{materializeError ? (
				<Alert status="danger">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>Không thể chuẩn bị trò chơi mặc định</Alert.Title>
						<Alert.Description>{materializeError}</Alert.Description>
					</Alert.Content>
					<Button
						isPending={materializing}
						size="sm"
						variant="secondary"
						onPress={materializeDefaultGame}
					>
						<RefreshCw aria-hidden="true" size={16} />
						Thử lại
					</Button>
				</Alert>
			) : null}

			{addSuccess ? (
				<Alert status="success">
					<Alert.Indicator />
					<Alert.Content>
						<Alert.Title>{addSuccess}</Alert.Title>
					</Alert.Content>
				</Alert>
			) : null}

			{campaignGames.length === 0 ? (
				<div className="grid min-h-48 place-items-center" role="status">
					<Spinner aria-label="Đang chuẩn bị trò chơi mặc định" />
				</div>
			) : (
				<ul aria-label="Danh sách trò chơi chiến dịch" className="admin-game-grid">
					{campaignGames.map((campaignGame) => (
						<CampaignGameCard
							campaignGame={campaignGame}
							campaignId={campaignId}
							heroUrl={campaign.heroAsset?.url}
							key={campaignGame.id}
							row={rowsByGameId.get(campaignGame.id)}
						/>
					))}
				</ul>
			)}

			<Modal.Backdrop isOpen={addOpen} onOpenChange={setAddOpen}>
				<Modal.Container placement="center" size="lg">
					<Modal.Dialog className="sm:max-w-xl">
						<Modal.Header>
							<Modal.Heading>Thêm trò chơi</Modal.Heading>
							<Modal.CloseTrigger aria-label="Đóng" />
						</Modal.Header>
						<Modal.Body>
							<div className="admin-stack">
								<GameTemplatePicker columns={1} onChange={setAddTemplateId} value={addTemplateId} />
								<div className="admin-field">
									<Label htmlFor="add-game-name">Tên hiển thị (tuỳ chọn)</Label>
									<Input
										fullWidth
										id="add-game-name"
										placeholder={gameTemplateCatalog[addTemplateId].name}
										value={addName}
										variant="secondary"
										onChange={(event) => setAddName(event.currentTarget.value)}
									/>
								</div>
								{addError ? (
									<Alert status="danger">
										<Alert.Indicator />
										<Alert.Content>
											<Alert.Title>{addError}</Alert.Title>
										</Alert.Content>
									</Alert>
								) : null}
							</div>
						</Modal.Body>
						<Modal.Footer>
							<Button isDisabled={adding} variant="ghost" onPress={() => setAddOpen(false)}>
								Huỷ
							</Button>
							<Button isPending={adding} onPress={() => void addGame()}>
								<Plus aria-hidden="true" size={16} />
								Thêm trò chơi
							</Button>
						</Modal.Footer>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</AdminPageShell>
	);
}

/** Games-tab preview card (§11.3.1): full-bleed template preview on top, one
 * computed status chip and three metrics in the body, "Vận hành" in the
 * footer above the stretched title link. */
function CampaignGameCard({
	campaignGame,
	campaignId,
	heroUrl,
	row,
}: {
	campaignGame: CampaignGameEntry;
	campaignId: string;
	heroUrl: string | null | undefined;
	row: GameBreakdownRow | undefined;
}) {
	const templateId = campaignGame.templateId as GameTemplateId;
	const status = resolveEffectiveGameStatus(campaignGame, Date.now());
	// An unknown template id at runtime renders an empty cover box and a
	// normal card instead of crashing the list.
	const template = getGameTemplate(templateId) as GameTemplate | undefined;
	const templateName = template ? gameTemplateCatalog[templateId]?.name : undefined;
	const metaParts = [
		templateName !== undefined && templateName !== campaignGame.name ? templateName : null,
		status.detail,
	].filter((part): part is string => part !== null);
	const Preview = template?.Preview;
	return (
		<li className="admin-game-card">
			<div aria-hidden="true" className="admin-game-card__cover" inert>
				{template && Preview ? (
					<GamePreviewFrame>
						<Preview
							config={template.normalizeConfig(campaignGame.config)}
							heroUrl={heroUrl}
						/>
					</GamePreviewFrame>
				) : (
					<div className="aspect-video" />
				)}
			</div>
			<div className="admin-game-card__body">
				<div className="admin-game-card__head">
					<Link
						className="admin-game-card__title"
						params={{ campaignGameId: campaignGame.id, campaignId }}
						to="/campaigns/$campaignId/games/$campaignGameId"
					>
						{campaignGame.name}
					</Link>
					<GameStatusChip status={status} />
				</div>
				{/* Always rendered (empty with aria-hidden) so the metric strips
				    of one row of cards share a y position (§11.6.5/Q5). */}
				<p aria-hidden={metaParts.length === 0 ? true : undefined} className="admin-game-card__meta">{metaParts.join(" · ")}</p>
				<dl className="admin-game-card__metrics">
					<div>
						<dt>Lượt mở</dt>
						<dd>{viNumberFormat.format(row?.opens ?? 0)}</dd>
					</div>
					<div>
						<dt>Hoàn tất</dt>
						<dd>{viNumberFormat.format(row?.completions ?? 0)}</dd>
					</div>
					<div>
						<dt>Chuyển đổi</dt>
						<dd>
							{formatPercent(
								conversionRate({ claims: row?.claims ?? 0, opens: row?.opens ?? 0 }),
							)}
						</dd>
					</div>
				</dl>
			</div>
			<div className="admin-game-card__footer">
				<Link
					aria-label={`Vận hành ${campaignGame.name}`}
					className={buttonVariants({ size: "sm", variant: "secondary" })}
					params={{ campaignGameId: campaignGame.id }}
					to="/operate/$campaignGameId"
				>
					<Play aria-hidden="true" size={14} />
					Vận hành
				</Link>
			</div>
		</li>
	);
}
