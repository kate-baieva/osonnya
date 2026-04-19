export interface Slot {
  id: string        // EventId або datetime-рядок
  datetime: string  // оригінальний рядок "2025-02-15 15:30:00" для запису в таблицю
  date: string      // "2025-02-15"
  time: string      // "15:30"
  capacity: number
  registered: number
  spotsRemaining: number
}

export interface RegistrationPayload {
  slotId: string
  name: string
  surname: string
  phone: string
  instagram?: string
  peopleCount: number
}
