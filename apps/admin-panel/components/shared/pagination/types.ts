export type PageChangePayload = {
  page: number
  pageSize: number
  offset: number
  limit: number
  totalPages: number
  totalItems: number
}

export type PaginationProps = {
  totalItems: number
  pageSize?: number
  resetKey?: string | number | boolean
  onPageChange: (payload: PageChangePayload) => void
}
