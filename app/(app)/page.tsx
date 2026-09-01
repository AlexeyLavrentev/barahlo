import { redirect } from 'next/navigation'

// The protected zone root lands on the employees list (route built in
// Task 3 of this plan).
export default function AppPage() {
  redirect('/employees')
}
