"use client";

import { Alert, Button, Chip, Input, Label, Spinner } from "@heroui/react";
import { EmptyState, ItemCard, ItemCardGroup, NativeSelect, Widget } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { FileQuestion, Gamepad2, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CampaignContextNav } from "@/app/_workspace/-components/CampaignContextNav";
import { AdminPageShell } from "@/app/components/AdminPageShell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	gameTemplates as gameTemplateCatalog,
	type CampaignGameConfig,
	type GameTemplateId,
} from "@/lib/gameTemplates";

const statusLabels = {
	active: "Đang chạy",
	archived: "Đã lưu trữ",
	draft: "Bản nháp",
} as const;

export function CampaignSectionFeature({ campaignId }: { campaignId: string }) {
	const context = useQuery(api.campaigns.getCampaignGamesRouteContext, {
		campaignId: campaignId as Id<"campaigns">,
	});
	const ensureCampaignGame = useMutation(api.campaigns.ensureCampaignGameForRoute);
	const createCampaignGame = useMutation(api.campaignGames.createCampaignGame);
	const [attemptedCampaignId, setAttemptedCampaignId] = useState("");
	const [materializing, setMaterializing] = useState(false);
	const [materializeError, setMaterializeError] = useState("");
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
			setAddSuccess(`Đã thêm "${result.name}". Hãy cấu hình và kích hoạt trò chơi.`);
		} catch (unknownError) {
			setAddError(
				unknownError instanceof Error ? unknownError.message : "Không thể thêm trò chơi",
			);
		} finally {
			setAdding(false);
		}
	}, [addName, addTemplateId, context, createCampaignGame]);

	if (context === undefined) {
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

	return (
		<AdminPageShell
			breadcrumbContext={campaign.name}
			description="Mỗi trò chơi là một trải nghiệm độc lập thuộc chiến dịch, với cấu hình và trạng thái riêng."
			eyebrow={campaign.brandName || "Chiến dịch"}
			title="Trò chơi chiến dịch"
		>
			<CampaignContextNav campaignId={campaignId} />
			<div className="mb-6 flex flex-wrap items-center gap-2">
				<Chip color={campaign.status === "active" ? "success" : "default"} variant="soft">
					{campaignStatus}
				</Chip>
				<span className="text-sm text-muted">
					{campaignGames.length} trải nghiệm đã cấu hình
				</span>
			</div>

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

			{campaignGames.length === 0 ? (
				<div className="grid min-h-48 place-items-center" role="status">
					<Spinner aria-label="Đang chuẩn bị trò chơi mặc định" />
				</div>
			) : (
				<ItemCardGroup
					aria-label="Danh sách trò chơi chiến dịch"
					className="grid gap-4 md:grid-cols-2"
					variant="secondary"
				>
					{campaignGames.map((campaignGame) => (
						<Link
							className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
							key={campaignGame.id}
							params={{ campaignGameId: campaignGame.id, campaignId }}
							to="/campaigns/$campaignId/games/$campaignGameId"
						>
							<ItemCard variant="secondary">
								<ItemCard.Icon>
									<Gamepad2 aria-hidden="true" />
								</ItemCard.Icon>
								<ItemCard.Content>
									<ItemCard.Title>{campaignGame.name}</ItemCard.Title>
									<ItemCard.Description>
										{gameTemplateCatalog[campaignGame.templateId].name} · Trải nghiệm #{campaignGame.id.slice(-6)}
									</ItemCard.Description>
								</ItemCard.Content>
								<ItemCard.Action>
									<Chip
										color={campaignGame.status === "active" ? "success" : "default"}
										variant="soft"
									>
										{statusLabels[campaignGame.status]}
									</Chip>
								</ItemCard.Action>
							</ItemCard>
						</Link>
					))}
				</ItemCardGroup>
			)}

			<Widget className="mt-6">
				<Widget.Header>
					<Widget.Title>Thêm trò chơi</Widget.Title>
					<Widget.Description>
						Chọn một mẫu trò chơi và thêm vào chiến dịch dưới dạng trải nghiệm độc lập.
					</Widget.Description>
				</Widget.Header>
				<Widget.Content className="gap-4">
					{addSuccess || addError ? (
						<Alert status={addError ? "danger" : "success"}>
							<Alert.Indicator />
							<Alert.Content>
								<Alert.Title>{addError || addSuccess}</Alert.Title>
							</Alert.Content>
						</Alert>
					) : null}
					<div className="grid gap-4 md:grid-cols-2">
						<div className="admin-field">
							<Label htmlFor="add-game-template">Mẫu trò chơi</Label>
							<NativeSelect fullWidth variant="secondary">
								<NativeSelect.Trigger
									aria-label="Mẫu trò chơi"
									id="add-game-template"
									value={addTemplateId}
									onChange={(event) => setAddTemplateId(event.currentTarget.value as GameTemplateId)}
								>
									{Object.values(gameTemplateCatalog).map((template) => (
										<NativeSelect.Option key={template.id} value={template.id}>
											{template.name}
										</NativeSelect.Option>
									))}
									<NativeSelect.Indicator />
								</NativeSelect.Trigger>
							</NativeSelect>
						</div>
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
					</div>
					<div>
						<Button isPending={adding} onPress={() => void addGame()}>
							<Plus aria-hidden="true" size={16} />
							Thêm trò chơi
						</Button>
					</div>
				</Widget.Content>
			</Widget>
		</AdminPageShell>
	);
}
