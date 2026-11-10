import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Alliance Square Verified Advisors', template: '%s · Alliance Square' },
  description: 'Verify that you are talking to a genuine Alliance Square property advisor.',
};

export const viewport: Viewport = { themeColor: '#231F20', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
