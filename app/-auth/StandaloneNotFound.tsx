import { buttonVariants } from "@heroui/react";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import adminCss from "@/app/styles/admin.css?url";

/**
 * Root not-found for URLs outside every route tree. It renders outside the
 * workspace layout, so it brings the admin stylesheet itself (React 19
 * hoists the link into the document head).
 */
export function StandaloneNotFound() {
	return (
		<main className="admin-standalone">
			<link href={adminCss} precedence="default" rel="stylesheet" />
			<div className="admin-standalone__inner">
				<div className="admin-standalone__brand">
					<span className="admin-sidebar-brand__mark"><Sparkles aria-hidden="true" size={18} /></span>
					<span className="text-base font-semibold text-foreground">Campaign Game Studio</span>
				</div>
				<section className="admin-standalone__card">
					<p className="text-sm font-medium text-muted">404</p>
					<div className="flex flex-col gap-2">
						<h1 className="text-2xl font-semibold tracking-tight text-foreground">Không tìm thấy trang</h1>
						<p className="text-sm text-muted">Địa chỉ này không tồn tại hoặc đã được chuyển đi.</p>
					</div>
					<Link className={buttonVariants({ variant: "primary" })} to="/">Về trang chủ</Link>
				</section>
			</div>
		</main>
	);
}
