export type Author = { id: string; name: string; slug: string; bio: string; image_url?: string }
export type Genre = { id: string; name: string; slug: string; description: string }
export type Comment = { id: string; body: string; created_at: string; author: string }
export type Book = {
  id: string; title: string; slug: string; isbn: string; description: string; publication_year: number
  price_cents: number; currency: string; stock_qty: number; available: boolean; cover_url: string
  video_url?: string; featured: boolean; active: boolean; rating_average: number; rating_count: number
  authors: Author[]; genres: Genre[]; comments?: Comment[]; related?: Book[]
}
export type User = { id: string; email: string; full_name: string; role: 'customer' | 'admin'; is_verified: boolean }
export type CartItem = { id: string; book_id: string; quantity: number; book: Pick<Book, 'title' | 'slug' | 'cover_url' | 'price_cents' | 'stock_qty'> }
export type Cart = { id: string; items: CartItem[]; subtotal_cents: number; currency: string }
export type Address = { name: string; line1: string; line2: string; city: string; postal_code: string; country: string }
export type Order = {
  id: string; number: string; status: string; subtotal_cents: number; shipping_cents: number; total_cents: number
  currency: string; tracking_reference?: string; created_at: string; shipping: Address
  items: Array<{ book_id: string; title: string; isbn: string; cover_url: string; unit_price_cents: number; quantity: number }>
}
export type Page<T> = { items: T[]; page: number; page_size: number; total: number }
export type ApiError = { code: string; message: string; field_errors?: Record<string, string>; request_id?: string }

