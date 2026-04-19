import { z } from 'zod'

export const registrationSchema = z.object({
  slotId: z.string().min(1, 'Оберіть слот'),
  name: z.string().min(2, 'Введіть ім\'я (мінімум 2 символи)').max(100),
  phone: z
    .string()
    .regex(
      /^\+?380\d{9}$|^0\d{9}$/,
      'Введіть коректний номер телефону (наприклад: 0501234567)'
    ),
  peopleCount: z
    .number({ invalid_type_error: 'Введіть кількість людей' })
    .int()
    .min(1, 'Мінімум 1 людина')
    .max(20, 'Максимум 20 людей'),
})

export type RegistrationInput = z.infer<typeof registrationSchema>
