import { Check } from "lucide-react";

/**
 * Single save-state surface for header-save forms: dirty → warning dot +
 * "Có thay đổi chưa lưu."; just saved → success check + the success message;
 * clean and never saved in this visit → nothing. Rendered inside the page
 * header actions, immediately left of the save button.
 */
export function AdminSaveStatus({ dirty, savedMessage }: { dirty: boolean; savedMessage?: string }) {
	return (
		<div className="admin-save-status" role="status">
			{dirty ? (
				<span className="admin-save-status__item text-warning">
					<span aria-hidden="true" className="admin-save-status__dot" />
					<span>Có thay đổi chưa lưu.</span>
				</span>
			) : savedMessage ? (
				<span className="admin-save-status__item text-success">
					<Check aria-hidden="true" size={15} />
					<span>{savedMessage}</span>
				</span>
			) : null}
		</div>
	);
}
