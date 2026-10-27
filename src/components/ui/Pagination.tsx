'use client'

import { Button } from '@/components/ui/button'

interface PaginationProps {
  /** Zero-based page. */
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

/** "Showing 26–50 of 130" with Previous and Next; renders nothing when everything fits on one page. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  if (total <= pageSize) return null
  const pages = Math.ceil(total / pageSize)
  const first = page * pageSize + 1
  const last = Math.min(total, (page + 1) * pageSize)
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-1">
      <p className="text-xs text-muted-foreground">Showing {first}–{last} of {total}</p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {page + 1} of {pages}</span>
        <Button type="button" variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
