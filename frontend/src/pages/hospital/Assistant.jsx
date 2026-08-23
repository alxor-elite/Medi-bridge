import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, AlertCircle, User } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../../context/auth'
import { aiApi } from '../../api'
import { initials } from '../../lib/format'
import { cn } from '../../lib/cn'

/**
 * Chat with the MediBridge AI assistant.
 *
 * Every reply comes from the FastAPI service via `aiApi.chat` - nothing here
 * invents an answer. The transcript lives in component state only; refreshing
 * starts a new conversation.
 */

const SUGGESTIONS = [
  'Do we have adrenaline?',
  'How much paracetamol is in stock?',
  'Which suppliers stock oxygen cylinders?',
]

export default function Assistant() {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  // Keep the newest message in view as the transcript grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  async function send(text) {
    const question = text.trim()
    if (!question || sending) return

    setError('')
    setDraft('')
    setMessages((prev) => [...prev, { id: `q-${Date.now()}`, role: 'user', text: question }])
    setSending(true)

    try {
      const reply = await aiApi.chat(question)
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }])
    } catch (err) {
      setError(err.message || 'The assistant is unavailable right now.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-8rem)] max-w-3xl flex-col space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Assistant</h1>
        <p className="mt-1 text-sm text-slate-500">
          Ask about stock, medicines and suppliers across the network.
        </p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {messages.length === 0 && !sending && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                <Sparkles className="size-6" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">MediBridge AI</p>
                <p className="mt-0.5 text-sm text-slate-500">Ask a question to get started.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <Message key={m.id} role={m.role} text={m.text} userName={user?.name} />
          ))}

          {sending && (
            <div className="flex gap-3">
              <Avatar role="assistant" />
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-3">
                <Spinner size="sm" label="The assistant is thinking" />
                <span className="text-sm text-slate-500">Thinking…</span>
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {error && (
          <p
            role="alert"
            className="mx-5 mb-3 flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-3 text-sm font-medium text-danger-700"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(draft)
          }}
          className="flex items-center gap-2 border-t border-slate-100 p-4"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about stock…"
            aria-label="Message"
            autoComplete="off"
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" leftIcon={Send} loading={sending} disabled={!draft.trim()}>
            Send
          </Button>
        </form>
      </Card>
    </div>
  )
}

function Avatar({ role, userName }) {
  const isUser = role === 'user'
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        isUser ? 'bg-slate-200 text-slate-600' : 'bg-brand-600 text-white',
      )}
      aria-hidden="true"
    >
      {isUser ? initials(userName) || <User className="size-4" /> : <Sparkles className="size-4" />}
    </span>
  )
}

function Message({ role, text, userName }) {
  const isUser = role === 'user'
  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Avatar role={role} userName={userName} />
      <div className={cn('min-w-0 max-w-[80%]', isUser && 'text-right')}>
        <p className="mb-1 text-xs font-medium text-slate-400">
          {isUser ? userName || 'You' : 'MediBridge AI'}
        </p>
        <p
          className={cn(
            'inline-block whitespace-pre-wrap rounded-2xl px-4 py-3 text-left text-sm',
            isUser
              ? 'rounded-tr-sm bg-brand-600 text-white'
              : 'rounded-tl-sm bg-slate-50 text-slate-700',
          )}
        >
          {text}
        </p>
      </div>
    </div>
  )
}
