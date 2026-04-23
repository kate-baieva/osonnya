import { z } from 'zod'

// Схема лише для полів форми (без slotId — він передається окремо)
export const formSchema = z.object({
  name: z.string().min(2, 'Введіть ім\'я (мінімум 2 символи)').max(50),
  surname: z.string().min(2, 'Введіть прізвище (мінімум 2 символи)').max(50),
  phone: z
    .string()
    .min(1, 'Введіть номер телефону')
    .regex(
      /^\+?3?8?0?\d{9}$|^0\d{9}$/,
      'Введіть коректний номер (наприклад: 0501234567)'
    ),
  instagram: z.string().max(100).optional(),
  peopleCount: z
    .number({ invalid_type_error: 'Введіть кількість людей' })
    .int()
    .min(1, 'Мінімум 1 людина')
    .max(20, 'Максимум 20 людей'),
})

// Повна схема для API (з slotId)
export const registrationSchema = formSchema.extend({
  slotId: z.string().min(1, 'Оберіть слот'),
})

export type FormInput = z.infer<typeof formSchema>
export type RegistrationInput = z.infer<typeof registrationSchema>
