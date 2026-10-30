import { Fragment } from 'react'

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/

/**
 * Gemini's reply as text with a little formatting: **bold**, `code`, "- " bullets and "#" headings.
 * Everything becomes plain React elements, never HTML, links or images, so the model cannot load remote content.
 */
export function ChatText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words">
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[-*]\s+/.test(line)
        const body = line.replace(/^\s*[-*]\s+/, '').replace(/^#{1,6}\s+/, '')
        return (
          <Fragment key={i}>
            {i > 0 && '\n'}
            {bullet && '• '}
            {body.split(INLINE).map((part, j) => {
              if (/^\*\*[^*\n]+\*\*$/.test(part)) return <strong key={j}>{part.slice(2, -2)}</strong>
              if (/^`[^`\n]+`$/.test(part)) return <code key={j} className="rounded bg-muted px-1 text-[0.9em]">{part.slice(1, -1)}</code>
              return part
            })}
          </Fragment>
        )
      })}
    </p>
  )
}
