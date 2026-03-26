'use client'

import Link from 'next/link'

export function AppNav() {
  return (
    <nav className="flex items-center justify-between px-4 py-3 border-b sm:px-8">
      <Link href="/" className="text-lg font-semibold font-heading">
        Food Planner
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/library" className="text-sm text-muted-foreground hover:text-foreground">
          Meal Library
        </Link>
        <Link href="/rules" className="text-sm text-muted-foreground hover:text-foreground">
          Rules
        </Link>
      </div>
    </nav>
  )
}
