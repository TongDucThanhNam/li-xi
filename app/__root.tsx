import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ConvexClientProvider } from "./ConvexClientProvider";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Campaign Game Studio | Marketing Game Platform" },
      {
        name: "description",
        content:
          "Nền tảng chiến dịch trò chơi marketing với liên kết chơi công khai, tài sản thương hiệu, phần thưởng và trải nghiệm khách hàng cao cấp.",
      },
    ],
    links: [],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="vi">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexClientProvider>
          <Outlet />
        </ConvexClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
