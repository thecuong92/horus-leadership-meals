import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Horus Leadership Meals — Quản lý Ăn trưa, Ăn tối & Hoàn ứng BOD',
  description:
    'Hệ thống quản lý bữa ăn Leadership Lunch & Game Strategy Dinner, điểm danh thực tế, phân bổ chi phí và đối soát hoàn ứng của Horus Entertainment.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
