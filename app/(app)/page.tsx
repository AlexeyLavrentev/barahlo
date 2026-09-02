import { redirect } from 'next/navigation'

// The protected zone root lands on the devices list — the product's center of
// gravity (UI-SPEC «App shell change»). Redirect happens in the RSC before any
// render; the /devices route itself guards the session.
export default function AppPage() {
  redirect('/devices')
}
