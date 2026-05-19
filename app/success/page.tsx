import { redirect } from 'next/navigation'

// Стара адреса — перенаправляємо на нову
export default function OldSuccessPage() {
  redirect('/sumy/success')
}
