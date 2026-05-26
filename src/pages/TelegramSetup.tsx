import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

type Step = 'start' | 'code' | 'success'

export default function TelegramSetup() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { token } = useAuth()
  const isHe = i18n.language === 'he'

  const [step, setStep] = useState<Step>('start')
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error_invalid' | 'error_expired'>('idle')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const code = digits.join('')
  const stepIndex = step === 'start' ? 0 : step === 'code' ? 1 : 2

  // Auto-focus first digit input when entering code step
  useEffect(() => {
    if (step === 'code') {
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
    }
  }, [step])

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...digits]
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setDigits(next)
    inputRefs.current[Math.min(pasted.length, 5)]?.focus()
  }

  async function handleVerify() {
    if (code.length !== 6 || status === 'loading') return
    setStatus('loading')
    try {
      const res = await fetch('/api/telegram-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setStep('success')
        setStatus('idle')
      } else {
        setStatus(data.error === 'expired_code' ? 'error_expired' : 'error_invalid')
      }
    } catch {
      setStatus('error_invalid')
    }
  }

  function handleResend() {
    setDigits(['', '', '', '', '', ''])
    setStatus('idle')
    setStep('start')
  }

  // ── Step indicator labels
  const steps = [
    t('telegram.stepStartBot'),
    t('telegram.stepEnterCode'),
    t('telegram.stepSuccess'),
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col" dir={isHe ? 'rtl' : 'ltr'}>

      {/* Top bar */}
      <header className="fixed top-0 w-full z-50 bg-surface-container-lowest border-b border-outline-variant shadow-sm">
        <div className="flex justify-between items-center px-4 h-16 max-w-7xl mx-auto">
          <h1 className="font-jakarta font-extrabold text-xl text-primary tracking-tight">
            {t('app.name')}
          </h1>
          <button
            onClick={() => navigate('/')}
            className="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors text-lg leading-none"
            aria-label={t('item.cancel')}
          >
            ✕
          </button>
        </div>
      </header>

      <main className="flex-1 pt-16 pb-10 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-xl flex flex-col items-center gap-gutter">

          {/* ── Stepper ────────────────────────────────────────────────────── */}
          <div className="w-full mb-4">
            <div className="flex justify-between items-start relative">
              {/* background track */}
              <div className={`absolute top-5 ${isHe ? 'right-0' : 'left-0'} w-full h-0.5 bg-surface-container-highest z-0`} />
              {/* progress track */}
              <div
                className={`absolute top-5 ${isHe ? 'right-0' : 'left-0'} h-0.5 bg-primary z-0 transition-all duration-500`}
                style={{ width: stepIndex === 0 ? '0%' : stepIndex === 1 ? '50%' : '100%' }}
              />

              {steps.map((label, i) => {
                const done = stepIndex > i
                const current = stepIndex === i
                return (
                  <div key={i} className="z-10 flex flex-col items-center gap-2 w-16">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all
                      ${done ? 'bg-primary text-on-primary'
                        : current ? 'bg-primary-container text-on-primary-container ring-2 ring-primary ring-offset-2'
                        : 'bg-surface-container-highest text-outline'}`}
                    >
                      {i === 0 ? '🤖' : i === 1 ? '🔑' : '✓'}
                    </div>
                    <span className={`text-xs font-semibold font-jakarta text-center leading-tight
                      ${done || current ? (i === 0 && done ? 'text-primary' : current ? 'text-on-surface' : 'text-primary') : 'text-outline'}`}
                    >
                      {label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Main card ─────────────────────────────────────────────────── */}
          <div className="w-full bg-surface-container-lowest rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] border border-outline-variant/30">
            <div className="p-lg space-y-lg">

              {/* Header */}
              <div className="text-center space-y-xs">
                <h2 className="font-jakarta font-bold text-2xl text-on-surface">{t('telegram.linkTitle')}</h2>
                <p className="font-jakarta text-body-md text-on-surface-variant">{t('telegram.linkSubtitle')}</p>
              </div>

              {/* Illustration */}
              <div className="relative h-28 rounded-lg overflow-hidden bg-surface-container-low flex items-center justify-center">
                <div className="bg-white p-md rounded-xl shadow-lg border border-primary/10 flex items-center gap-md">
                  <div className="bg-primary-container w-12 h-12 rounded-full flex items-center justify-center text-2xl">
                    📤
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 w-24 bg-surface-container-highest rounded-full" />
                    <div className="h-2 w-32 bg-primary-container/50 rounded-full" />
                  </div>
                </div>
              </div>

              {/* ── STEP 1: Instructions ── */}
              {step === 'start' && (
                <div className="space-y-md">
                  <div className="bg-surface-container-low p-md rounded-lg border border-outline-variant/30">
                    <p className="font-jakarta text-body-md text-on-surface leading-relaxed">
                      {t('telegram.openBotInstruction')}
                    </p>
                  </div>
                  <button
                    onClick={() => setStep('code')}
                    className="w-full h-12 bg-primary text-on-primary rounded-lg font-jakarta font-bold hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    {t('telegram.continueBtn')}
                  </button>
                </div>
              )}

              {/* ── STEP 2: Code entry ── */}
              {step === 'code' && (
                <div className="space-y-md">
                  <div className="bg-surface-container-low p-md rounded-lg border border-outline-variant/30 space-y-md">
                    <div className="flex items-start gap-sm">
                      <div className="bg-primary/10 p-1.5 rounded-lg flex-shrink-0 mt-0.5">
                        <span className="text-primary text-sm">ℹ️</span>
                      </div>
                      <p className="font-jakarta text-body-md text-on-surface-variant">
                        {t('telegram.codeSentInfo')}
                      </p>
                    </div>

                    {/* 6 digit boxes — always LTR */}
                    <div>
                      <label className="block font-jakarta text-xs text-secondary uppercase tracking-wider mb-sm px-0.5">
                        {t('telegram.verificationCode')}
                      </label>
                      <div className="flex gap-sm justify-between" dir="ltr">
                        {[0, 1, 2].map(i => (
                          <input
                            key={i}
                            ref={el => { inputRefs.current[i] = el }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digits[i]}
                            placeholder="•"
                            onChange={e => handleDigitChange(i, e.target.value)}
                            onKeyDown={e => handleKeyDown(i, e)}
                            onPaste={handlePaste}
                            className="w-12 h-14 text-center text-xl font-bold border-2 border-outline-variant rounded-lg focus:border-primary focus:outline-none bg-white transition-colors"
                          />
                        ))}
                        <div className="w-2 flex-shrink-0" />
                        {[3, 4, 5].map(i => (
                          <input
                            key={i}
                            ref={el => { inputRefs.current[i] = el }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            value={digits[i]}
                            placeholder="•"
                            onChange={e => handleDigitChange(i, e.target.value)}
                            onKeyDown={e => handleKeyDown(i, e)}
                            onPaste={handlePaste}
                            className="w-12 h-14 text-center text-xl font-bold border-2 border-outline-variant rounded-lg focus:border-primary focus:outline-none bg-white transition-colors"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Error messages */}
                  {status === 'error_invalid' && (
                    <p className="text-center font-jakarta text-sm text-error">{t('telegram.error')}</p>
                  )}
                  {status === 'error_expired' && (
                    <p className="text-center font-jakarta text-sm text-error">{t('telegram.expiredCode')}</p>
                  )}

                  <div className="flex flex-col gap-sm">
                    <button
                      onClick={handleVerify}
                      disabled={code.length !== 6 || status === 'loading'}
                      className="w-full h-12 bg-primary text-on-primary rounded-lg font-jakarta font-bold hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {status === 'loading' ? '...' : t('telegram.verifyBtn')}
                    </button>
                    <button
                      onClick={handleResend}
                      className="w-full h-12 text-primary font-jakarta font-semibold hover:bg-primary/5 rounded-lg transition-colors"
                    >
                      {t('telegram.resendCode')}
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Success ── */}
              {step === 'success' && (
                <div className="space-y-md text-center py-sm">
                  <div className="text-6xl">✅</div>
                  <p className="font-jakarta font-bold text-xl text-on-surface">{t('telegram.success')}</p>
                  <button
                    onClick={() => navigate('/')}
                    className="w-full h-12 bg-primary text-on-primary rounded-lg font-jakarta font-bold hover:brightness-110 active:scale-[0.98] transition-all"
                  >
                    {t('telegram.goToList')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Bento cards ───────────────────────────────────────────────── */}
          {step !== 'success' && (
            <div className="grid grid-cols-2 gap-gutter w-full">
              <div className="p-md bg-surface-container-lowest border border-outline-variant/30 rounded-xl flex items-center gap-sm">
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0 text-lg">🔒</div>
                <div className="min-w-0">
                  <h4 className="font-jakarta font-bold text-sm text-on-surface">{t('telegram.privateSecureTitle')}</h4>
                  <p className="font-jakarta text-xs text-secondary leading-tight">{t('telegram.privateSecureDesc')}</p>
                </div>
              </div>
              <div className="p-md bg-surface-container-lowest border border-outline-variant/30 rounded-xl flex items-center gap-sm">
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center flex-shrink-0 text-lg">⚡</div>
                <div className="min-w-0">
                  <h4 className="font-jakarta font-bold text-sm text-on-surface">{t('telegram.quickSyncTitle')}</h4>
                  <p className="font-jakarta text-xs text-secondary leading-tight">{t('telegram.quickSyncDesc')}</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
