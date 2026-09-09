"use client";

import { Alert, Button } from "@heroui/react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { AdminPageShell } from "@/app/components/AdminPageShell";

export function StandaloneAdminRouteError({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	return (
		<main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6">
			<div className="mx-auto w-full max-w-3xl">
				<AdminPageShell
					description="Dữ liệu hoặc phiên đăng nhập đang tạm thời chưa khả dụng."
					title="Không thể mở trang"
				>
					<Alert status="danger">
						<Alert.Indicator>
							<CircleAlert aria-hidden="true" />
						</Alert.Indicator>
						<Alert.Content>
							<Alert.Title>Đã xảy ra lỗi</Alert.Title>
							<Alert.Description>
								{error.message || "Không thể hoàn tất yêu cầu."}
							</Alert.Description>
						</Alert.Content>
					</Alert>
					<Button onPress={reset}>
						<RefreshCw aria-hidden="true" size={16} />
						Thử lại
					</Button>
				</AdminPageShell>
			</div>
		</main>
	);
}
