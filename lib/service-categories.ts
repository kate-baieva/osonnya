// Окремо від other-orders.ts і без жодних імпортів: цей список потрібен
// і формі в браузері, і серверу. Якщо тягнути його з other-orders.ts,
// у клієнтський бандл заїжджає googleapis і збірка падає на 'fs'.

// Колонка «Category» в аркуші «Other Orders» — строгий випадний список,
// що живиться з «Settings!A2:A». За нею рахується P&L, тож нове значення
// тут нічого не дасть: його просто не прийме таблиця.
export const CATEGORIES = [
  { value: 'Coworking',   label: 'Коворкінг' },
  { value: 'Kiln Rent',   label: 'Випал виробів' },
  { value: 'Studio Rent', label: 'Оренда студії · дитячі заняття' },
  { value: 'Shop',        label: 'Крамниця' },
] as const

export type Category = (typeof CATEGORIES)[number]['value']

export function isCategory(value: string): value is Category {
  return CATEGORIES.some((item) => item.value === value)
}

export function categoryLabel(value: string): string {
  return CATEGORIES.find((item) => item.value === value)?.label ?? value
}
