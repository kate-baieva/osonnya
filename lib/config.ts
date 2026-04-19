export const config = {
  spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID!,
  sheets: {
    slots: process.env.SHEET_SLOTS ?? 'Slots',
    registrations: process.env.SHEET_REGISTRATIONS ?? 'Registrations',
  },
  // 1-based column indices for the Slots sheet
  slotCols: {
    id: Number(process.env.COL_SLOT_ID ?? 1),
    date: Number(process.env.COL_SLOT_DATE ?? 2),
    time: Number(process.env.COL_SLOT_TIME ?? 3),
    title: Number(process.env.COL_SLOT_TITLE ?? 4),
    capacity: Number(process.env.COL_SLOT_CAPACITY ?? 5),
    registered: Number(process.env.COL_SLOT_REGISTERED ?? 6),
    price: Number(process.env.COL_SLOT_PRICE ?? 7),
    active: Number(process.env.COL_SLOT_ACTIVE ?? 8),
  },
}
