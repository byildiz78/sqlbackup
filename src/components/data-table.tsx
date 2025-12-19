"use client"

import { useState, useMemo, useEffect } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight } from "lucide-react"

export interface Column<T> {
  key: string
  header: string | (() => React.ReactNode)
  sortable?: boolean
  searchable?: boolean
  cell?: (item: T) => React.ReactNode
  // For sorting non-primitive values
  sortValue?: (item: T) => string | number | Date | null
  className?: string
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  searchPlaceholder?: string
  pageSize?: number
  pageSizeOptions?: number[]
  emptyMessage?: string
  loading?: boolean
  selectable?: boolean
  selectedIds?: string[]
  onSelectionChange?: (selectedIds: string[]) => void
  idKey?: string
}

type SortDirection = "asc" | "desc" | null

export function DataTable<T extends object>({
  data,
  columns,
  searchPlaceholder = "Search...",
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyMessage = "No data found",
  loading = false,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  idKey = "id",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  // Get ID from item
  const getItemId = (item: T): string => {
    return String(getNestedValue(item, idKey) ?? "")
  }

  // Get searchable columns
  const searchableColumns = columns.filter(col => col.searchable !== false)

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!search.trim()) return data

    const searchLower = search.toLowerCase()
    return data.filter(item => {
      return searchableColumns.some(col => {
        const value = getNestedValue(item, col.key)
        if (value === null || value === undefined) return false
        return String(value).toLowerCase().includes(searchLower)
      })
    })
  }, [data, search, searchableColumns])

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortKey || !sortDirection) return filteredData

    const column = columns.find(col => col.key === sortKey)
    if (!column) return filteredData

    return [...filteredData].sort((a, b) => {
      let aVal: unknown
      let bVal: unknown

      if (column.sortValue) {
        aVal = column.sortValue(a)
        bVal = column.sortValue(b)
      } else {
        aVal = getNestedValue(a, sortKey)
        bVal = getNestedValue(b, sortKey)
      }

      // Handle null/undefined
      if (aVal === null || aVal === undefined) return sortDirection === "asc" ? 1 : -1
      if (bVal === null || bVal === undefined) return sortDirection === "asc" ? -1 : 1

      // Compare values
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc"
          ? aVal.localeCompare(bVal, 'tr')
          : bVal.localeCompare(aVal, 'tr')
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection === "asc"
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime()
      }

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal
      }

      // Fallback to string comparison
      const aStr = String(aVal)
      const bStr = String(bVal)
      return sortDirection === "asc"
        ? aStr.localeCompare(bStr, 'tr')
        : bStr.localeCompare(aStr, 'tr')
    })
  }, [filteredData, sortKey, sortDirection, columns])

  // Paginate data
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedData.slice(start, start + pageSize)
  }, [sortedData, currentPage, pageSize])

  const totalPages = Math.ceil(sortedData.length / pageSize)

  // Selection logic - must be after paginatedData is defined
  const allVisibleSelected = useMemo(() => {
    if (!selectable || paginatedData.length === 0) return false
    return paginatedData.every(item => selectedIds.includes(getItemId(item)))
  }, [selectable, paginatedData, selectedIds, getItemId])

  const someVisibleSelected = useMemo(() => {
    if (!selectable || paginatedData.length === 0) return false
    const selectedCount = paginatedData.filter(item => selectedIds.includes(getItemId(item))).length
    return selectedCount > 0 && selectedCount < paginatedData.length
  }, [selectable, paginatedData, selectedIds, getItemId])

  const toggleItemSelection = (item: T) => {
    const itemId = getItemId(item)
    if (selectedIds.includes(itemId)) {
      onSelectionChange?.(selectedIds.filter(id => id !== itemId))
    } else {
      onSelectionChange?.([...selectedIds, itemId])
    }
  }

  const toggleAllVisible = () => {
    const visibleIds = paginatedData.map(item => getItemId(item))
    if (allVisibleSelected) {
      onSelectionChange?.(selectedIds.filter(id => !visibleIds.includes(id)))
    } else {
      const newSelection = [...new Set([...selectedIds, ...visibleIds])]
      onSelectionChange?.(newSelection)
    }
  }

  // Reset to first page when search or pageSize changes
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setCurrentPage(1)
  }

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value))
    setCurrentPage(1)
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === "asc") {
        setSortDirection("desc")
      } else if (sortDirection === "desc") {
        setSortKey(null)
        setSortDirection(null)
      }
    } else {
      setSortKey(key)
      setSortDirection("asc")
    }
  }

  const getSortIcon = (key: string) => {
    if (sortKey !== key) {
      return <ChevronsUpDown className="h-4 w-4 ml-1 opacity-50" />
    }
    if (sortDirection === "asc") {
      return <ChevronUp className="h-4 w-4 ml-1" />
    }
    return <ChevronDown className="h-4 w-4 ml-1" />
  }

  return (
    <div className="space-y-4">
      {/* Search and Page Size Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Rows per page:</span>
          <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map(size => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someVisibleSelected
                      }
                    }}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              {columns.map(column => {
                const headerContent = typeof column.header === 'function' ? column.header() : column.header
                return (
                  <TableHead
                    key={column.key}
                    className={column.className}
                  >
                    {column.sortable !== false ? (
                      <button
                        className="flex items-center hover:text-foreground transition-colors -ml-2 px-2 py-1 rounded"
                        onClick={() => handleSort(column.key)}
                      >
                        {headerContent}
                        {getSortIcon(column.key)}
                      </button>
                    ) : (
                      headerContent
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-24 text-center">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((item, index) => (
                <TableRow
                  key={(getNestedValue(item, 'id') as string) || index}
                  className={selectable && selectedIds.includes(getItemId(item)) ? "bg-muted/50" : ""}
                >
                  {selectable && (
                    <TableCell className="w-[40px]">
                      <Checkbox
                        checked={selectedIds.includes(getItemId(item))}
                        onCheckedChange={() => toggleItemSelection(item)}
                        aria-label="Select row"
                      />
                    </TableCell>
                  )}
                  {columns.map(column => (
                    <TableCell key={column.key} className={column.className}>
                      {column.cell
                        ? column.cell(item)
                        : String(getNestedValue(item, column.key) ?? "-")}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} entries
            {search && ` (filtered from ${data.length} total)`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              First
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {generatePageNumbers(currentPage, totalPages).map((page, i) => (
                page === "..." ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-muted-foreground">...</span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page as number)}
                    className="w-8"
                  >
                    {page}
                  </Button>
                )
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              Last
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper to get nested object values like "database.server.name"
function getNestedValue(obj: object, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object' && key in (current as object)) {
      return (current as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

// Generate page numbers with ellipsis
function generatePageNumbers(current: number, total: number): (number | string)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  if (current <= 3) {
    return [1, 2, 3, 4, 5, "...", total]
  }

  if (current >= total - 2) {
    return [1, "...", total - 4, total - 3, total - 2, total - 1, total]
  }

  return [1, "...", current - 1, current, current + 1, "...", total]
}
