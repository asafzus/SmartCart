import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../hooks/useAuth'
import type { ListItem } from '../pages/Home'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ChatDrawerProps {
  isOpen: boolean
  onClose: () => void
}

const MAX_STORED_MESSAGES = 30
const MAX_HISTORY_SENT = 5

// ── ChatDrawer ────────────────────────────────────────────────────────────────

export default function ChatDrawer({ isOpen, onClose }: ChatDrawerProps) {
  const { t, i18n } = useTranslation()
  const { token } = useAuth()
  const isHe = i18n.language === 'he'

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listItems, setListItems] = useState<ListItem[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Fetch list when drawer opens — fresh list each time
  useEffect(() => {
    if (!isOpen || !token) return
    fetch('/api/list-get', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => setListItems(data.items ?? []))
      .catch(() => {})
  }, [isOpen, token])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  // Focus input when drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 300)
    }
  }, [isOpen])

  // Auto-resize textarea as user types
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // Only barcode-linked unchecked items as context
  const listContext = listItems
    .filter(i => !i.isChecked && !i.isFreeText)
    .map(i => i.name)

  const clearChat = () => {
    setMessages([])
    setError(null)
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isLoading) return

    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setInput('')
    setError(null)

    const userMessage: Message = { role: 'user', content: text }

    // Cap stored history at MAX_STORED_MESSAGES
    const nextMessages = [...messages, userMessage].slice(-MAX_STORED_MESSAGES)
    setMessages(nextMessages)
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-MAX_HISTORY_SENT), // last 5 only
          listItems: listContext,
          lang: i18n.language,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(t('chat.error'))
        return
      }

      const assistantMessage: Message = { role: 'assistant', content: data.reply }
      setMessages(prev => [...prev, assistantMessage].slice(-MAX_STORED_MESSAGES))
    } catch {
      setError(t('chat.error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      )}

      {/* Drawer — always slides from the right */}
      <div
        className={`fixed top-0 bottom-0 right-0 z-50 flex flex-col bg-surface-container-lowest shadow-xl transition-transform duration-300 ease-in-out w-full sm:w-[400px]
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        dir={isHe ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant bg-surface-container-low flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="font-jakarta font-bold text-body-md text-on-surface">
                {t('chat.title')}
              </p>
              <p className="font-jakarta text-label-sm text-on-surface-variant">
                {t('chat.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="px-3 py-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors font-jakarta text-label-sm"
                title={t('chat.newChat')}
              >
                {t('chat.newChat')}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
              aria-label={t('item.cancel')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-8">
              <span className="text-5xl">🍳</span>
              <p className="font-jakarta text-body-md text-on-surface font-semibold">
                {t('chat.emptyTitle')}
              </p>
              <p className="font-jakarta text-label-sm text-on-surface-variant max-w-[260px]">
                {t('chat.emptySubtitle')}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className="flex">
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl font-jakarta text-body-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user'
                    ? 'ml-auto bg-primary text-on-primary rounded-br-sm'
                    : 'mr-auto bg-surface-container text-on-surface rounded-bl-sm'
                  }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Loading bubble */}
          {isLoading && (
            <div className="flex">
              <div className="mr-auto bg-surface-container px-4 py-2.5 rounded-2xl rounded-bl-sm">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="font-jakarta text-label-sm text-error text-center py-1">
              {error}
            </p>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-4 py-3 border-t border-outline-variant bg-surface-container-low flex-shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder')}
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-surface-container rounded-xl px-4 py-2.5 font-jakarta text-body-sm text-on-surface placeholder:text-on-surface-variant outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60 transition-all resize-none overflow-hidden leading-relaxed"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center flex-shrink-0 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 mb-0.5"
              aria-label={t('chat.send')}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
          <p className="font-jakarta text-label-sm text-on-surface-variant text-center mt-2 opacity-60">
            {t('chat.disclaimer')}
          </p>
        </div>
      </div>
    </>
  )
}
