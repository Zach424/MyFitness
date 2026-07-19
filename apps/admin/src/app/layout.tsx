import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  title: '衡迹 · 支持证据台',
  description: '只读、最小权限、全程留痕的衡迹支持工作台',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
