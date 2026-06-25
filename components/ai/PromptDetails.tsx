'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function PromptDetails({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex cursor-pointer items-center gap-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors select-none"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {open ? 'Скрыть' : 'Показать prompt'}
      </button>
      {open && (
        <pre className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-[11px] font-sans leading-relaxed text-zinc-500 whitespace-pre-wrap">
          {prompt}
        </pre>
      )}
    </div>
  )
}
