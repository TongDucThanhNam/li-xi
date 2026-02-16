import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ConvexClientProvider } from './ConvexClientProvider';

export const metadata: Metadata = {
  title: "Lì Xì Station",
  description: "Ứng dụng rút lì xì với ngân sách theo số lượng tờ và leaderboard theo chủ ví",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1.0,
};

export default function GachaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif:wght@400;600;700&display=swap"
        />
      </head>
      <body>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
