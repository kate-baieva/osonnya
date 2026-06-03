import { NextResponse } from 'next/server'
import { getIndividualPrices } from '@/lib/google-sheets'
import { getSpreadsheetId } from '@/lib/studios'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const studio = searchParams.get('studio') ?? 'sumy'
  try {
    const spreadsheetId = getSpreadsheetId(studio)
    const prices = await getIndividualPrices(spreadsheetId)
    return NextResponse.json(prices)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
