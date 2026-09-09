"use client";

import { AlertDialog, Button } from "@heroui/react";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

export function UnsavedChangesGuard({ dirty, saving, onSave }: { dirty: boolean; saving: boolean; onSave: () => Promise<boolean> }) {
	const returnFocusRef = useRef<HTMLElement | null>(null);
	useEffect(() => {
		if (!dirty) returnFocusRef.current = null;
	}, [dirty]);
	useEffect(() => {
		if (!dirty || saving) return;
		const rememberNavigationTarget = (event: Event) => {
			if (!(event.target instanceof HTMLElement)) return;
			if (event.target.closest('[role="alertdialog"]')) return;
			returnFocusRef.current =
				event.target.closest<HTMLElement>("a, button, [tabindex]") ?? event.target;
		};
		document.addEventListener("pointerdown", rememberNavigationTarget, true);
		document.addEventListener("click", rememberNavigationTarget, true);
		return () => {
			document.removeEventListener("pointerdown", rememberNavigationTarget, true);
			document.removeEventListener("click", rememberNavigationTarget, true);
		};
	}, [dirty, saving]);
	const blocker = useBlocker({
		shouldBlockFn: () => {
			const shouldBlock = dirty && !saving;
			if (
				shouldBlock &&
				typeof document !== "undefined" &&
				returnFocusRef.current === null &&
				document.activeElement instanceof HTMLElement &&
				document.activeElement !== document.body &&
				document.activeElement !== document.documentElement
			) {
				returnFocusRef.current = document.activeElement;
			}
			return shouldBlock;
		},
		enableBeforeUnload: dirty && !saving,
		withResolver: true,
	});
	const reset = useCallback(() => {
		const returnFocus = returnFocusRef.current;
		blocker.reset?.();
		window.setTimeout(() => returnFocus?.focus(), 100);
	}, [blocker]);

	if (blocker.status !== "blocked") return null;

	return (
		<AlertDialog.Backdrop isOpen onOpenChange={(isOpen) => { if (!isOpen) reset(); }}>
			<AlertDialog.Container placement="center">
				<AlertDialog.Dialog>
					<AlertDialog.Header>
						<AlertDialog.Icon status="warning" />
						<AlertDialog.Heading>Bạn có thay đổi chưa lưu</AlertDialog.Heading>
					</AlertDialog.Header>
					<AlertDialog.Body>
						Lưu trước khi rời trang, bỏ các thay đổi, hoặc tiếp tục chỉnh sửa.
					</AlertDialog.Body>
					<AlertDialog.Footer>
						<Button autoFocus variant="ghost" onPress={reset}>Tiếp tục chỉnh sửa</Button>
						<Button variant="secondary" onPress={blocker.proceed}>Bỏ thay đổi</Button>
						<Button isPending={saving} onPress={async () => { if (await onSave()) blocker.proceed(); }}>Lưu và rời trang</Button>
					</AlertDialog.Footer>
				</AlertDialog.Dialog>
			</AlertDialog.Container>
		</AlertDialog.Backdrop>
	);
}
