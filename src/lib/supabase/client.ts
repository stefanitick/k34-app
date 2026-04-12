=import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function getProofUrl(path: string): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(path, 60 * 10) // valid 10 menit
  return data?.signedUrl ?? null
}
