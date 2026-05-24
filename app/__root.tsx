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
      { title: "Li Xi Station | Prize Draw Campaign Studio" },
      {
        name: "description",
        content:
          "SaaS prize-draw platform for branded lucky campaigns, public claim links, campaign assets, and premium guest experiences.",
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
