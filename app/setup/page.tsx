"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { RARITY_LABELS, RARITY_VALUES, Rarity } from "@/lib/lixiPolicy";
import { clearOwnerSession } from "@/lib/ownerSession";
import { useOwnerSession } from "@/lib/useOwnerSession";

type BudgetRow = {
	id: string;
	amount: string;
	quantity: string;
	rarity: Rarity;
};

function createBudgetRow(partial?: Partial<BudgetRow>): BudgetRow {
	return {
		id: crypto.randomUUID(),
		amount: partial?.amount ?? "",
		quantity: partial?.quantity ?? "",
		rarity: partial?.rarity ?? "common",
	};
}

function formatCurrency(amount: number) {
	return `${amount.toLocaleString("vi-VN")}đ`;
}

export default function SetupPage() {
	const router = useRouter();
	const configureBudget = useMutation(api.setup.configureBudget);
	const owner = useOwnerSession();

	const [rows, setRows] = useState<BudgetRow[]>([
		createBudgetRow({ amount: "100000", quantity: "15", rarity: "common" }),
		createBudgetRow({ amount: "200000", quantity: "20", rarity: "legend" }),
	]);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [info, setInfo] = useState("");

	useEffect(() => {
		if (owner === null) {
			router.replace("/auth");
		}
	}, [owner, router]);

	const ownerId = owner?.userId;
	const ownerName = owner?.username ?? "";

	const setupState = useQuery(
		api.setup.getSetupState,
		ownerId ? { ownerId } : "skip",
	);

	useEffect(() => {
		if (!setupState?.hasSetup || !setupState.canConfigure) {
			return;
		}

		setRows(
			setupState.items.map((item) =>
				createBudgetRow({
					amount: String(item.amount),
					quantity: String(item.initialQuantity),
					rarity: item.rarity,
				}),
			),
		);
	}, [setupState]);

	const estimatedTotalBudget = useMemo(() => {
		return rows.reduce((sum, row) => {
			const amount = Number(row.amount);
			const quantity = Number(row.quantity);
			if (!Number.isInteger(amount) || !Number.isInteger(quantity)) {
				return sum;
			}
			if (amount <= 0 || quantity <= 0) {
				return sum;
			}
			return sum + amount * quantity;
		}, 0);
	}, [rows]);

	const handleLogout = () => {
		clearOwnerSession();
		router.replace("/auth");
	};

	const handleSubmit = async () => {
		if (!ownerId) {
			return;
		}

		setError("");
		setInfo("");
		setSubmitting(true);

		try {
			const payload = rows.map((row) => {
				const amount = Number(row.amount);
				const quantity = Number(row.quantity);

				if (!Number.isInteger(amount) || amount <= 0) {
					throw new Error("Mỗi mệnh giá phải là số nguyên dương");
				}
				if (!Number.isInteger(quantity) || quantity <= 0) {
					throw new Error("Số lượng tờ phải là số nguyên dương");
				}

				return {
					amount,
					quantity,
					rarity: row.rarity,
				};
			});

			await configureBudget({
				ownerId,
				items: payload,
			});

			setInfo("Đã cấu hình ngân sách thành công.");
			router.replace("/draw");
		} catch (unknownError) {
			setError(
				unknownError instanceof Error
					? unknownError.message
					: "Không thể lưu cấu hình",
			);
		} finally {
			setSubmitting(false);
		}
	};

	if (owner === undefined || setupState === undefined) {
		return (
			<main className="min-h-screen grid place-items-center p-6 bg-[var(--color-black-ink)] text-[#ffe3ab]">
				Đang tải cấu hình...
			</main>
		);
	}

	const hasSetup = setupState.hasSetup;

	return (
		<main
			className="min-h-screen grid place-items-center p-6 bg-[var(--color-black-ink)] font-vn"
			style={{
				backgroundImage: [
					"radial-gradient(circle at 10% 10%, rgba(255, 166, 77, 0.22), transparent 45%)",
					"radial-gradient(circle at 90% 4%, rgba(188, 30, 30, 0.34), transparent 40%)",
					"linear-gradient(150deg, #120202 0%, #270707 50%, #190505 100%)",
				].join(", "),
			}}
		>
			<section className="w-full max-w-[960px] rounded-[18px] border border-[rgba(255, 204, 102, 0.38)] bg-[rgba(26, 7, 7, 0.9)] shadow-[0_24px_68px_rgba(0, 0, 0, 0.42)] p-6">
				<header className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-4 mb-[18px]">
					<div>
						<h1 className="text-[#ffe9b2] text-[32px] font-cinzel">
							Thiết lập ngân sách
						</h1>
						<p className="text-[rgba(255, 230, 169, 0.8)] text-sm mt-1">
							Chủ ví: {ownerName}
						</p>
					</div>
					<div className="flex gap-2 items-center justify-start sm:justify-end">
						<button
							type="button"
							className="border border-[rgba(242, 194, 86, 0.45)] rounded-xl bg-transparent text-[#ffd98d] px-3 py-2.5 cursor-pointer hover:bg-[rgba(242,194,86,0.1)] transition-colors"
							onClick={() => router.push("/draw")}
						>
							Trạm rút
						</button>
						<button
							type="button"
							className="border border-[rgba(242, 194, 86, 0.45)] rounded-xl bg-transparent text-[#ffd98d] px-3 py-2.5 cursor-pointer hover:bg-[rgba(242,194,86,0.1)] transition-colors"
							onClick={handleLogout}
						>
							Đăng xuất
						</button>
					</div>
				</header>

				{setupState.budget ? (
					<div className="flex gap-4 flex-wrap bg-[rgba(248, 196, 78, 0.08)] border border-[rgba(248, 196, 78, 0.35)] rounded-xl color-[#ffe3a5] p-3 mb-4">
						<div>
							<span className="text-[rgba(255, 217, 140, 0.8)]">
								Tổng ngân sách:
							</span>{" "}
							{formatCurrency(setupState.budget.totalBudget)}
						</div>
						<div>
							<span className="text-[rgba(255, 217, 140, 0.8)]">Còn lại:</span>{" "}
							{formatCurrency(setupState.budget.remainingBudget)}
						</div>
					</div>
				) : null}

				{hasSetup && !setupState.canConfigure ? (
					<div className="border border-[rgba(255, 154, 96, 0.45)] rounded-xl bg-[rgba(86, 29, 6, 0.35)] color-[#ffc7a0] p-3.5">
						Đã có lượt rút phát sinh nên cấu hình ngân sách bị khóa để bảo toàn
						lịch sử.
					</div>
				) : (
					<>
						<div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_auto] gap-2.5 color-[rgba(255, 210, 126, 0.9)] text-[13px] mb-2.5 px-1">
							<span>Mệnh giá</span>
							<span>Số lượng tờ</span>
							<span>Độ hiếm</span>
							<span></span>
						</div>

						<div className="grid gap-2">
							{rows.map((row) => (
								<div
									className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_auto] gap-2.5"
									key={row.id}
								>
									<input
										className="h-11 rounded-xl border border-[rgba(224, 170, 61, 0.35)] bg-[rgba(13, 3, 3, 0.82)] text-[#ffe3ab] px-2.5 outline-none focus:border-[rgba(255, 222, 139, 0.85)] focus:shadow-[0_0_0_3px_rgba(255, 222, 139, 0.14)]"
										type="number"
										min={1}
										value={row.amount}
										onChange={(event) => {
											const amount = event.currentTarget.value;
											setRows((current) =>
												current.map((item) =>
													item.id === row.id ? { ...item, amount } : item,
												),
											);
										}}
										placeholder="100000"
									/>
									<input
										className="h-11 rounded-xl border border-[rgba(224, 170, 61, 0.35)] bg-[rgba(13, 3, 3, 0.82)] text-[#ffe3ab] px-2.5 outline-none focus:border-[rgba(255, 222, 139, 0.85)] focus:shadow-[0_0_0_3px_rgba(255, 222, 139, 0.14)]"
										type="number"
										min={1}
										value={row.quantity}
										onChange={(event) => {
											const quantity = event.currentTarget.value;
											setRows((current) =>
												current.map((item) =>
													item.id === row.id ? { ...item, quantity } : item,
												),
											);
										}}
										placeholder="15"
									/>
									<select
										className="h-11 rounded-xl border border-[rgba(224, 170, 61, 0.35)] bg-[rgba(13, 3, 3, 0.82)] text-[#ffe3ab] px-2.5 outline-none focus:border-[rgba(255, 222, 139, 0.85)] focus:shadow-[0_0_0_3px_rgba(255, 222, 139, 0.14)]"
										value={row.rarity}
										onChange={(event) => {
											const rarity = event.currentTarget.value as Rarity;
											setRows((current) =>
												current.map((item) =>
													item.id === row.id ? { ...item, rarity } : item,
												),
											);
										}}
									>
										{RARITY_VALUES.map((rarity) => (
											<option key={rarity} value={rarity}>
												{RARITY_LABELS[rarity]}
											</option>
										))}
									</select>
									<button
										type="button"
										className="rounded-xl border border-[rgba(248, 127, 127, 0.55)] bg-[rgba(73, 12, 12, 0.5)] text-[#ffb5b5] px-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
										disabled={rows.length <= 1}
										onClick={() =>
											setRows((current) =>
												current.filter((item) => item.id !== row.id),
											)
										}
									>
										Xóa
									</button>
								</div>
							))}
						</div>

						<div className="mt-3.5 flex flex-wrap justify-between gap-3 items-center">
							<button
								type="button"
								className="rounded-xl border border-[rgba(250, 211, 131, 0.44)] bg-transparent text-[#ffd68b] px-3.5 py-2.5 cursor-pointer hover:bg-[rgba(250,211,131,0.1)] transition-colors"
								onClick={() =>
									setRows((current) => [...current, createBudgetRow()])
								}
							>
								Thêm mệnh giá
							</button>

							<div className="text-[#ffe6ab] text-sm">
								Tổng dự kiến: {formatCurrency(estimatedTotalBudget)}
							</div>
						</div>
					</>
				)}

				{error ? (
					<p className="mt-3 rounded-xl border border-[rgba(255, 110, 110, 0.5)] bg-[rgba(95, 15, 15, 0.55)] color-[#ffc0c0] p-2.5 text-sm">
						{error}
					</p>
				) : null}
				{info ? (
					<p className="mt-3 rounded-xl border border-[rgba(124, 214, 157, 0.45)] bg-[rgba(8, 84, 37, 0.35)] color-[#c8ffda] p-2.5 text-sm">
						{info}
					</p>
				) : null}

				{!hasSetup || setupState.canConfigure ? (
					<button
						type="button"
						className="mt-3.5 w-full h-12 rounded-xl bg-[linear-gradient(135deg,#f1b750_0%,#cb8c2b_100%)] text-[#361a00] font-bold text-base cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
						disabled={submitting}
						onClick={handleSubmit}
					>
						{submitting ? "Đang lưu..." : "Lưu cấu hình ngân sách"}
					</button>
				) : null}
			</section>
		</main>
	);
}
