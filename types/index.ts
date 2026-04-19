export interface Slot {
  id: string
  date: string
  time: string
  title: string
  capacity: number
  registered: number
  spotsRemaining: number
  price?: number
}

export interface RegistrationPayload {
  slotId: string
  name: string
  phone: string
  peopleCount: number
}
