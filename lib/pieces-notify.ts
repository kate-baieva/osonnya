import { getPieces, markNotified, NOTIFIED, type Piece } from './pieces'
import { findClientEmail } from './google-sheets'
import { getSpreadsheetId } from './studios'
import { sendPiecesReady, parseMkDatetime, safeSend } from './client-mail'

// Лист «вироби готові» надсилається сам, коли майстриня ставить статус «Готово».
//
// Два правила, через які це не просто «надіслати лист на кожен рядок»:
//
// 1. Статуси міняються пачкою, а в одного клієнта зазвичай кілька виробів.
//    П'ять листів замість одного — це те, на що скаржаться. Тому групуємо
//    за клієнтом і шлемо один лист зі списком номерів.
//
// 2. Статус можна поставити вдруге — виправити помилку, повернути з «Брак».
//    Відмітка в колонці Communication і є захистом: рядок, у якому вже
//    стоїть «Повідомили», другого листа не отримує.

export const READY_STATUS = 'Готово'

export interface NotifyResult {
  /** Скільком клієнтам лист пішов */
  sent: number
  /** Імена тих, кому не пішов: немає пошти в «Clients» */
  withoutEmail: string[]
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function today(): string {
  return new Date().toLocaleDateString('uk-UA')
}

/**
 * Надсилає листи про готовність для щойно оновлених рядків.
 * Помилки назовні не віддає: статус уже збережено, і лист його не скасовує.
 */
export async function notifyPiecesReady(
  studioId: string,
  rowIndexes: number[],
): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, withoutEmail: [] }
  if (rowIndexes.length === 0) return result

  let pieces: Piece[]
  try {
    pieces = await getPieces(studioId)
  } catch (error) {
    console.error('[pieces-notify] вироби не прочитались:', (error as Error).message)
    return result
  }

  const wanted = new Set(rowIndexes)
  const fresh = pieces.filter((piece) =>
    wanted.has(piece.rowIndex)
    && piece.client
    // Повторна зміна статусу другого листа не спричиняє
    && !piece.communication.includes(NOTIFIED))

  // Групуємо за клієнтом: один лист — усі його вироби
  const byClient = new Map<string, Piece[]>()
  for (const piece of fresh) {
    const key = normalize(piece.client)
    const list = byClient.get(key)
    if (list) list.push(piece)
    else byClient.set(key, [piece])
  }

  const spreadsheetId = getSpreadsheetId(studioId)
  const stamp = `${NOTIFIED} листом ${today()}`

  for (const group of Array.from(byClient.values())) {
    const client = group[0].client
    const email = await findClientEmail(client, spreadsheetId)

    if (!email) {
      result.withoutEmail.push(client)
      continue
    }

    // Дата МК у всіх виробів групи зазвичай одна; беремо найранішу
    const dates = group
      .map((piece) => parseMkDatetime(piece.mkDate)?.date)
      .filter((date): date is Date => date instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())

    let delivered = false
    await safeSend(`готовність виробів для «${client}»`, async () => {
      await sendPiecesReady({
        studioId,
        to: email,
        mkDate: dates[0] ?? null,
        numbers: group.map((piece) => piece.number),
      })
      delivered = true
    })

    if (!delivered) continue
    result.sent += 1

    try {
      await markNotified(studioId, group.map((piece) => piece.rowIndex), stamp)
    } catch (error) {
      // Лист уже пішов — втрата відмітки гірша за мовчання, але не фатальна:
      // найгірше, що станеться, — повторний лист при наступній зміні статусу
      console.warn('[pieces-notify] відмітка не збереглась:', (error as Error).message)
    }
  }

  return result
}
