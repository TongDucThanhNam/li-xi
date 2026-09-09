"use client";

import { Alert, Button } from "@heroui/react";
import { EmptyState } from "@heroui-pro/react";
import { Link } from "@tanstack/react-router";
import { CircleAlert, FileQuestion, RefreshCw } from "lucide-react";
import { AdminPageShell, AdminRouteStatus } from "@/app/components/AdminPageShell";

export function WorkspacePending() {
	return (
		<AdminRouteStatus
			description="Đang chuẩn bị dữ liệu và quyền truy cập cho trang này."
			status="Đang tải"
			title="Đang mở trang"
		/>
	);
}

export function WorkspaceRouteError({
	error,
	reset,
}: {
	error: Error;
	reset: () => void;
}) {
	return (
		<AdminPageShell
			description="Dữ liệu có thể tạm thời chưa khả dụng. Thử tải lại hoặc quay về danh sách chiến dịch."
			title="Không thể tải trang"
		>
			<Alert status="danger">
				<Alert.Indicator><CircleAlert aria-hidden="true" /></Alert.Indicator>
				<Alert.Content>
					<Alert.Title>Đã xảy ra lỗi</Alert.Title>
					<Alert.Description>{error.message || "Không thể hoàn tất yêu cầu."}</Alert.Description>
				</Alert.Content>
			</Alert>
			<div className="flex flex-wrap gap-3">
				<Button onPress={reset}>
					<RefreshCw aria-hidden="true" size={16} />
					Thử lại
				</Button>
				<Link className="inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium text-foreground" to="/campaigns">
					Quay lại chiến dịch
				</Link>
			</div>
		</AdminPageShell>
	);
}

export function WorkspaceNotFound() {
	return (
		<AdminPageShell
			description="Địa chỉ không tồn tại trong không gian làm việc hoặc đã được chuyển sang luồng mới."
			title="Không tìm thấy trang"
		>
			<EmptyState>
				<EmptyState.Header>
					<EmptyState.Media variant="icon"><FileQuestion aria-hidden="true" /></EmptyState.Media>
					<EmptyState.Title>Trang này không tồn tại</EmptyState.Title>
					<EmptyState.Description>
						Kiểm tra lại địa chỉ hoặc quay về danh sách chiến dịch để tiếp tục.
					</EmptyState.Description>
				</EmptyState.Header>
				<EmptyState.Content>
					<Link className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground" to="/campaigns">
						Quay lại chiến dịch
					</Link>
				</EmptyState.Content>
			</EmptyState>
		</AdminPageShell>
	);
}
