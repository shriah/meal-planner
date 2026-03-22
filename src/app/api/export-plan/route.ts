import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { readFileSync } from 'fs'
import { join } from 'path'
import { buildPlanElement } from '@/services/export-template'
import type { ExportPlanPayload } from '@/services/export-template'

// Load font once at module scope (cached across requests)
const fontData = readFileSync(join(process.cwd(), 'public/fonts/inter-regular.ttf'))

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ExportPlanPayload
    const element = buildPlanElement(payload)

    const svg = await satori(element, {
      width: 390,
      height: 1100,
      fonts: [{ name: 'Inter', data: fontData, weight: 400, style: 'normal' }],
    })

    const resvg = new Resvg(svg)
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()

    // Build filename from weekLabel
    const weekSlug = payload.weekLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')
    return new Response(new Uint8Array(pngBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="meal-plan-${weekSlug}.png"`,
      },
    })
  } catch (err) {
    console.error('Export failed:', err)
    return new Response(JSON.stringify({ error: 'Export failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
