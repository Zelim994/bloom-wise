"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera, X, Plus } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import {
  upsertFlower,
  uploadFlowerImage,
  addFlowerVariety,
  deleteFlowerVariety,
  addFlowerColor,
  deleteFlowerColor,
  archiveFlower,
  addToExistingFlower,
  type FlowerWithDetails,
} from "@/app/actions/catalog"
import type { FlowerForPurchase } from "@/app/actions/purchases"

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES  = ["Срезка", "Зелень", "Сухоцветы", "Стабилизированные", "Ветки / ягоды", "Горшечные", "Упаковка", "Материалы", "Декор", "Прочее"]
const UNITS       = ["шт", "кг", "г", "рулон", "м", "уп", "л", "букет"]
const SEASONALITY = ["весна", "лето", "осень", "зима", "круглый год"]
const STYLES      = ["классика", "нежная", "яркая", "минимализм", "экзотика", "текстура"]
const USAGE_TAGS  = ["моно", "сборные", "наполнитель", "объём", "вертикаль", "линии", "структура", "акцент"]

function toggleTag(arr: string[], tag: string): string[] {
  return arr.includes(tag) ? arr.filter((t) => t !== tag) : [...arr, tag]
}

// ─── Design primitives ────────────────────────────────────────────────────────

/** Карточка-блок */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-6 rounded-3xl border border-zinc-200 bg-white p-6">
      <p className="text-sm font-bold text-zinc-800 uppercase tracking-wide mb-5">{title}</p>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

/** Подпись поля */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest mb-1.5">
      {children}
    </p>
  )
}

/** Маленький значок ⓘ с hover-подсказкой (CSS-only, без библиотек) */
function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex shrink-0">
      <span className="h-4 w-4 rounded-full bg-zinc-100 text-zinc-400 text-[10px] font-bold flex items-center justify-center cursor-default select-none hover:bg-zinc-200 transition-colors">
        i
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-xl bg-zinc-800 px-3 py-2 text-xs text-white leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
        {text}
      </span>
    </span>
  )
}

/** Чип-тег */
function TagChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border font-medium transition-all ${
        active
          ? "bg-rose-100 border-rose-300 text-rose-700"
          : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {label}
    </button>
  )
}

type KnowledgeTagField = "seasonality" | "styles" | "usage_tags"

/**
 * Группа тегов: пресеты + кастомные + опциональная подсказка ⓘ.
 * «+» открывает inline-инпут прямо в ряду тегов. Enter или blur — подтверждение.
 */
function TagGroup({
  label,
  tooltip,
  preset,
  value,
  onToggle,
  onAdd,
}: {
  label: string
  tooltip?: string
  preset: string[]
  value: string[]
  onToggle: (tag: string) => void
  onAdd: (tag: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [val, setVal]   = useState("")
  const inputRef        = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function confirm() {
    const trimmed = val.trim()
    if (trimmed) onAdd(trimmed)
    setVal("")
    setOpen(false)
  }

  const customTags = value.filter((t) => !preset.includes(t))

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <div className="flex flex-wrap gap-1.5 items-center">
        {preset.map((t) => (
          <TagChip key={t} label={t} active={value.includes(t)} onClick={() => onToggle(t)} />
        ))}
        {customTags.map((t) => (
          <TagChip key={t} label={t} active onClick={() => onToggle(t)} />
        ))}
        {open ? (
          <input
            ref={inputRef}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); confirm() }
              if (e.key === "Escape") { setOpen(false); setVal("") }
            }}
            onBlur={confirm}
            placeholder="Новый тег..."
            className="text-xs px-3 py-1 rounded-full border border-rose-300 bg-rose-50 text-rose-700 placeholder:text-rose-300 focus:outline-none w-28"
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Добавить тег"
            className="h-6 w-6 rounded-full border border-zinc-200 bg-white text-zinc-400 hover:border-rose-300 hover:text-rose-500 hover:bg-rose-50 flex items-center justify-center transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  flower: FlowerWithDetails | null
  onClose: () => void
  /** "sheet" (default) — шторка справа, как в каталоге.
   *  "inline" — рендерится без обёртки Sheet, для встраивания в другие модалы. */
  mode?: "sheet" | "inline"
  /** Предзаполняет название при создании нового товара. */
  initialName?: string
  /** Если передан — вызывается после успешного сохранения (вместо router.refresh + onClose). */
  onSaved?: (flower: FlowerForPurchase) => void
  /** В inline-режиме вызывается при обнаружении дубля — позволяет родителю выбрать существующий товар. */
  onDuplicate?: (flower: { id: string; name: string; category: string; sku: string | null }) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CatalogFlowerForm({ open, flower, onClose, mode = "sheet", initialName, onSaved, onDuplicate }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error,     setError]     = useState("")
  const [uploading, setUploading] = useState(false)
  const [duplicateFlower, setDuplicateFlower] = useState<{ id: string; name: string; category: string; sku: string | null } | null>(null)
  const [isPendingAddToExisting, setIsPendingAddToExisting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Base fields ──────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name:            "",
    category:        "Срезка",
    unit:            "шт",
    sku:             "",
    description:     "",
    florist_comment: "",
  })

  // ── Photo ────────────────────────────────────────────────────────────────────
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile,    setPhotoFile]    = useState<File | null>(null)

  // ── Varieties & sizes ────────────────────────────────────────────────────────
  const [varieties,      setVarieties]      = useState<{ id?: string; name: string; size: string }[]>([])
  const [newVarietyName, setNewVarietyName] = useState("")
  const [newSize,        setNewSize]        = useState("")

  // ── Colors ───────────────────────────────────────────────────────────────────
  const [colors,       setColors]       = useState<{ id?: string; name: string; hex_code: string }[]>([])
  const [newColorName, setNewColorName] = useState("")

  // ── Knowledge base ───────────────────────────────────────────────────────────
  const [knowledge, setKnowledge] = useState({
    vase_life_min_days: "",
    vase_life_max_days: "",
    seasonality:        [] as string[],
    styles:             [] as string[],
    usage_tags:         [] as string[],
    property_tags:      [] as string[], // preserved in DB, hidden in UI
    care_notes:         "",
    buying_notes:       "",
    combination_notes:  "",
  })

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    setError("")
    setDuplicateFlower(null)
    setPhotoFile(null)
    setPhotoPreview(null)

    if (flower) {
      setForm({
        name:            flower.name,
        category:        flower.category,
        unit:            flower.unit,
        sku:             flower.sku             ?? "",
        description:     flower.description     ?? "",
        florist_comment: flower.florist_comment ?? "",
      })
      setVarieties(flower.varieties.map((v) => ({ id: v.id, name: v.name, size: v.size ?? "" })))
      setColors(flower.colors.map((c) => ({ id: c.id, name: c.name, hex_code: c.hex_code ?? "" })))
      setKnowledge({
        vase_life_min_days: flower.vase_life_min_days != null ? String(flower.vase_life_min_days) : "",
        vase_life_max_days: flower.vase_life_max_days != null ? String(flower.vase_life_max_days) : "",
        seasonality:        flower.seasonality   ?? [],
        styles:             flower.styles        ?? [],
        usage_tags:         flower.usage_tags    ?? [],
        property_tags:      flower.property_tags ?? [],
        care_notes:         flower.care_notes        ?? "",
        buying_notes:       flower.buying_notes      ?? "",
        combination_notes:  flower.combination_notes ?? "",
      })
    } else {
      setForm({ name: initialName ?? "", category: "Срезка", unit: "шт", sku: "", description: "", florist_comment: "" })
      setVarieties([])
      setColors([])
      setKnowledge({
        vase_life_min_days: "", vase_life_max_days: "",
        seasonality: [], styles: [], usage_tags: [], property_tags: [],
        care_notes: "", buying_notes: "", combination_notes: "",
      })
    }
    setNewVarietyName("")
    setNewSize("")
    setNewColorName("")
  }, [open, flower])

  // ── Photo upload ─────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError("Файл слишком большой. Максимум 5 МБ."); return }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError("")
  }

  async function uploadPhoto(flowerId: string, file: File): Promise<string | null> {
    const supabase = createClient()
    const ext  = file.name.split(".").pop() ?? "jpg"
    const path = `${flowerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from("product-photos")
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error || !data) return null
    const { data: { publicUrl } } = supabase.storage.from("product-photos").getPublicUrl(data.path)
    return publicUrl
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    startTransition(async () => {
      const result = await upsertFlower({
        id:              flower?.id,
        name:            form.name,
        category:        form.category,
        unit:            form.unit,
        sku:             form.sku             || undefined,
        description:     form.description     || undefined,
        florist_comment: form.florist_comment || undefined,
        vase_life_min_days: knowledge.vase_life_min_days !== "" ? Number(knowledge.vase_life_min_days) : null,
        vase_life_max_days: knowledge.vase_life_max_days !== "" ? Number(knowledge.vase_life_max_days) : null,
        seasonality:       knowledge.seasonality,
        styles:            knowledge.styles,
        usage_tags:        knowledge.usage_tags,
        property_tags:     knowledge.property_tags,
        care_notes:        knowledge.care_notes        || null,
        buying_notes:      knowledge.buying_notes      || null,
        combination_notes: knowledge.combination_notes || null,
      })

      if (result.error) {
        setError(result.error)
        if (result.duplicateFlower) setDuplicateFlower(result.duplicateFlower)
        return
      }
      const flowerId = result.id!

      const createdVarieties: Array<{ id: string; name: string; size: string | null }> = []
      const createdColors: Array<{ id: string; name: string; variety_id: string | null }> = []

      if (!flower?.id) {
        for (const v of varieties) {
          if (v.name.trim()) {
            const r = await addFlowerVariety(flowerId, v.name.trim(), v.size.trim() || undefined)
            if (r.id) createdVarieties.push({ id: r.id, name: v.name.trim(), size: v.size.trim() || null })
          }
        }
        for (const c of colors) {
          if (c.name.trim()) {
            const r = await addFlowerColor(flowerId, c.name.trim())
            if (r.id) createdColors.push({ id: r.id, name: c.name.trim(), variety_id: null })
          }
        }
      }

      let savedPhotoUrl: string | null = null
      if (photoFile) {
        setUploading(true)
        const url = await uploadPhoto(flowerId, photoFile)
        setUploading(false)
        if (url) {
          await uploadFlowerImage(flowerId, url, true)
          savedPhotoUrl = url
        }
      }

      router.refresh()

      if (onSaved) {
        onSaved({
          id:                flowerId,
          name:              form.name,
          category:          form.category,
          unit:              form.unit,
          min_stock:         0,
          sku:               form.sku || null,
          primary_image_url: savedPhotoUrl,
          varieties:         createdVarieties,
          colors:            createdColors,
        })
      }

      onClose()
    })
  }

  // ── Tag helpers ──────────────────────────────────────────────────────────────

  function handleTagAdd(field: KnowledgeTagField, tag: string) {
    if (knowledge[field].some((t) => t.toLowerCase() === tag.toLowerCase())) return
    setKnowledge((k) => ({ ...k, [field]: [...k[field], tag] }))
  }

  function handleTagToggle(field: KnowledgeTagField, tag: string) {
    setKnowledge((k) => ({ ...k, [field]: toggleTag(k[field], tag) }))
  }

  // ── Variety helpers ──────────────────────────────────────────────────────────

  function handleAddVariety() {
    const name = newVarietyName.trim()
    if (!name) return
    if (flower?.id) {
      startTransition(async () => {
        const result = await addFlowerVariety(flower.id, name)
        if (result.id) setVarieties((v) => [...v, { id: result.id, name, size: "" }])
        setNewVarietyName("")
        router.refresh()
      })
    } else {
      if (varieties.some((v) => v.name.toLowerCase() === name.toLowerCase() && !v.size)) return
      setVarieties((v) => [...v, { name, size: "" }])
      setNewVarietyName("")
    }
  }

  function handleAddSize() {
    const size = newSize.trim()
    if (!size) return
    // Если сорт/вид заполнен — привязываем размер к нему, иначе name=size (fallback)
    const baseName = newVarietyName.trim() || size
    if (flower?.id) {
      startTransition(async () => {
        const result = await addFlowerVariety(flower.id, baseName, size)
        if (result.id) setVarieties((v) => [...v, { id: result.id, name: baseName, size }])
        setNewSize("")
        router.refresh()
      })
    } else {
      // Dedup: пара name+size (trim+toLowerCase с обеих сторон)
      if (varieties.some(
        (v) => v.name.trim().toLowerCase() === baseName.toLowerCase() &&
               v.size.trim().toLowerCase() === size.toLowerCase()
      )) return
      setVarieties((v) => [...v, { name: baseName, size }])
      setNewSize("")
    }
  }

  function handleRemoveVariety(index: number) {
    const v = varieties[index]
    if (v.id && flower?.id) {
      startTransition(async () => {
        await deleteFlowerVariety(v.id!)
        setVarieties((arr) => arr.filter((_, i) => i !== index))
        router.refresh()
      })
    } else {
      setVarieties((arr) => arr.filter((_, i) => i !== index))
    }
  }

  // ── Color helpers ────────────────────────────────────────────────────────────

  function handleAddColor() {
    const name = newColorName.trim()
    if (!name) return
    if (flower?.id) {
      startTransition(async () => {
        const result = await addFlowerColor(flower.id, name)
        if (result.id) setColors((c) => [...c, { id: result.id, name, hex_code: "" }])
        setNewColorName("")
        router.refresh()
      })
    } else {
      if (colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) return
      setColors((c) => [...c, { name, hex_code: "" }])
      setNewColorName("")
    }
  }

  function handleRemoveColor(index: number) {
    const c = colors[index]
    if (c.id && flower?.id) {
      startTransition(async () => {
        await deleteFlowerColor(c.id!)
        setColors((arr) => arr.filter((_, i) => i !== index))
        router.refresh()
      })
    } else {
      setColors((arr) => arr.filter((_, i) => i !== index))
    }
  }

  function handleArchive() {
    if (!flower || !confirm("Убрать товар из каталога? Данные сохранятся.")) return
    startTransition(async () => {
      await archiveFlower(flower.id)
      router.refresh()
      onClose()
    })
  }

  async function handleAddToExisting() {
    if (!duplicateFlower || isPendingAddToExisting) return
    setIsPendingAddToExisting(true)

    const result = await addToExistingFlower(
      duplicateFlower.id,
      varieties.filter((v) => v.name.trim()).map((v) => ({ name: v.name.trim(), size: v.size.trim() || undefined })),
      colors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim() }))
    )

    setIsPendingAddToExisting(false)

    if (result.error) { setError(result.error); return }

    if (result.flower) {
      if (onSaved) {
        onSaved(result.flower)
      } else {
        router.refresh()
      }
    }
    onClose()
  }

  const setField =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const currentPhoto = photoPreview ?? flower?.primary_image_url


  // ── Shared form cards ─────────────────────────────────────────────────────────

  const formCards = (
    <div>
            <div className="py-5 space-y-4">

              {/* ── 1. ОСНОВНОЕ ─────────────────────────────────────────────── */}
              <Card title="Основное">
                {currentPhoto ? (
                  <div className="relative rounded-xl overflow-hidden border border-zinc-200 h-44">
                    <img src={currentPhoto} alt="Фото товара" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                      className="absolute top-2 right-2 h-7 w-7 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-black/50 hover:bg-black/70 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      Заменить
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full h-32 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 hover:border-rose-300 hover:bg-rose-50/40 transition-colors group"
                  >
                    <div className="h-9 w-9 rounded-full bg-zinc-100 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                      <Camera className="h-5 w-5 text-zinc-400 group-hover:text-rose-500" />
                    </div>
                    <p className="text-sm font-medium text-zinc-500">
                      Добавить фото
                      <span className="text-zinc-400 font-normal text-xs ml-1">· JPG, PNG, до 5 МБ</span>
                    </p>
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div>
                  <Label>Наименование *</Label>
                  <Input
                    value={form.name}
                    onChange={setField("name")}
                    placeholder="Роза, Тюльпан, Лента атласная..."
                    required
                    className="border-zinc-200 h-10 bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Категория</Label>
                    <select
                      value={form.category}
                      onChange={setField("category")}
                      className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                    >
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Артикул</Label>
                    <Input
                      value={form.sku}
                      onChange={setField("sku")}
                      placeholder="FLW-000001"
                      className="border-zinc-200 h-10 font-mono text-sm bg-white"
                    />
                  </div>
                </div>

                <div>
                  <Label>Единица измерения</Label>
                  <select
                    value={form.unit}
                    onChange={setField("unit")}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-400"
                  >
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </Card>

              {/* ── 2. ВАРИАНТЫ ТОВАРА ──────────────────────────────────────── */}
              <Card title="Варианты товара">
                <div>
                  <Label>Сорт / вид</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newVarietyName}
                      onChange={(e) => setNewVarietyName(e.target.value)}
                      placeholder="Mondial, Red Naomi..."
                      className="border-zinc-200 h-9 text-sm flex-1 bg-white"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddVariety())}
                    />
                    <button
                      type="button"
                      onClick={handleAddVariety}
                      disabled={!newVarietyName.trim()}
                      className="h-9 w-9 flex items-center justify-center rounded-md bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-40 transition-colors shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Цвет</Label>
                  {colors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {colors.map((c, i) => (
                        <span
                          key={i}
                          className="flex items-center gap-1 bg-white border border-zinc-200 text-zinc-700 text-xs font-medium px-2.5 py-1 rounded-full"
                        >
                          {c.name}
                          <button
                            type="button"
                            onClick={() => handleRemoveColor(i)}
                            className="text-zinc-300 hover:text-red-500 transition-colors ml-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="Красный, Белый, Нежно-розовый..."
                      className="border-zinc-200 h-9 text-sm flex-1 bg-white"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddColor())}
                    />
                    <button
                      type="button"
                      onClick={handleAddColor}
                      disabled={!newColorName.trim()}
                      className="h-9 w-9 flex items-center justify-center rounded-md bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-40 transition-colors shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Доступные размеры</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      placeholder="50, 60, 70, Extra, Baby..."
                      className="border-zinc-200 h-9 text-sm flex-1 bg-white"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddSize())}
                    />
                    <button
                      type="button"
                      onClick={handleAddSize}
                      disabled={!newSize.trim()}
                      className="h-9 w-9 flex items-center justify-center rounded-md bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-40 transition-colors shrink-0"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {varieties.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-zinc-500 mb-0">Созданные варианты</p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {varieties.map((v, i) => (
                        <span
                          key={i}
                          className="flex items-center gap-1 bg-white border border-zinc-200 text-zinc-700 text-xs font-medium px-2.5 py-1 rounded-full"
                        >
                          {(v.size && v.name === v.size) ? v.size : `${v.name}${v.size ? ` · ${v.size}` : ""}`}
                          <button
                            type="button"
                            onClick={() => handleRemoveVariety(i)}
                            className="text-zinc-300 hover:text-red-500 transition-colors ml-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* ── 3. ДЛЯ ПОДБОРА БУКЕТА ───────────────────────────────────── */}
              <Card title="Для подбора букета">
                <div>
                  <Label>Стойкость, дней</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="от"
                      value={knowledge.vase_life_min_days}
                      onChange={(e) => setKnowledge((k) => ({ ...k, vase_life_min_days: e.target.value }))}
                      className="w-24 h-9 text-sm border-zinc-200 bg-white"
                    />
                    <span className="text-zinc-300">—</span>
                    <Input
                      type="number"
                      min="0"
                      placeholder="до"
                      value={knowledge.vase_life_max_days}
                      onChange={(e) => setKnowledge((k) => ({ ...k, vase_life_max_days: e.target.value }))}
                      className="w-24 h-9 text-sm border-zinc-200 bg-white"
                    />
                  </div>
                </div>

                <TagGroup
                  label="Сезонность"
                  tooltip="Когда этот цветок чаще подходит или особенно актуален. Помогает планировать закупку и подбирать букеты по сезону."
                  preset={SEASONALITY}
                  value={knowledge.seasonality}
                  onToggle={(t) => handleTagToggle("seasonality", t)}
                  onAdd={(t) => handleTagAdd("seasonality", t)}
                />

                <TagGroup
                  label="Стиль"
                  tooltip="Визуальный характер цветка: нежный, яркий, классический, минималистичный и т.д. Помогает подбирать цветы под настроение букета."
                  preset={STYLES}
                  value={knowledge.styles}
                  onToggle={(t) => handleTagToggle("styles", t)}
                  onAdd={(t) => handleTagAdd("styles", t)}
                />

                <TagGroup
                  label="Применение в букете"
                  tooltip="Роль цветка в букете: моно, наполнитель, объём, линия, акцент и т.д. Помогает флористу и ИИ понимать, как использовать цветок."
                  preset={USAGE_TAGS}
                  value={knowledge.usage_tags}
                  onToggle={(t) => handleTagToggle("usage_tags", t)}
                  onAdd={(t) => handleTagAdd("usage_tags", t)}
                />

                <div>
                  <Label>С чем сочетается</Label>
                  <textarea
                    value={knowledge.combination_notes}
                    onChange={(e) => setKnowledge((k) => ({ ...k, combination_notes: e.target.value }))}
                    placeholder="Гипсофила, лагурус, эвкалипт..."
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-rose-400 placeholder:text-zinc-400"
                  />
                </div>
              </Card>

              {/* ── 4. УХОД И ЗАМЕТКИ ────────────────────────────────────────── */}
              <Card title="Уход и заметки">
                <div>
                  <Label>Уход и хранение</Label>
                  <textarea
                    value={knowledge.care_notes}
                    onChange={(e) => setKnowledge((k) => ({ ...k, care_notes: e.target.value }))}
                    placeholder="Хранить при 4°С, обрезать стебли косо..."
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-rose-400 placeholder:text-zinc-400"
                  />
                </div>
                <div>
                  <Label>На что смотреть при приёмке</Label>
                  <textarea
                    value={knowledge.buying_notes}
                    onChange={(e) => setKnowledge((k) => ({ ...k, buying_notes: e.target.value }))}
                    placeholder="Степень раскрытия, плотность лепестков..."
                    rows={2}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 resize-none focus:outline-none focus:ring-2 focus:ring-rose-400 placeholder:text-zinc-400"
                  />
                </div>
              </Card>

            </div>
    </div>
  )

  const errorBanner = error ? (
    <div className="px-6 py-3 border-t border-red-100 bg-red-50">
      <p className="text-sm text-red-600">{error}</p>
      {duplicateFlower && mode === "sheet" && (
        <p className="mt-1.5 text-xs text-red-600">
          Найдите «{duplicateFlower.name}» в списке каталога и добавьте к нему нужный вариант или цвет.
        </p>
      )}
      {duplicateFlower && mode === "inline" && (
        <div className="flex flex-wrap gap-3 mt-2">
          <button
            type="button"
            onClick={() => onDuplicate?.(duplicateFlower)}
            className="text-xs font-medium text-rose-700 underline hover:text-rose-900"
          >
            Выбрать существующий товар
          </button>
          {(varieties.some((v) => v.name.trim()) || colors.some((c) => c.name.trim())) && (
            <button
              type="button"
              onClick={handleAddToExisting}
              disabled={isPendingAddToExisting}
              className="text-xs font-medium text-zinc-700 underline hover:text-zinc-900 disabled:opacity-50"
            >
              {isPendingAddToExisting ? "Добавляем..." : "Добавить размер/цвет к существующему"}
            </button>
          )}
        </div>
      )}
    </div>
  ) : null

  const actionBar = (
    <div className="border-t border-zinc-200 bg-white px-6 py-4 flex items-center gap-2">
      {mode === "inline" && (
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          className="border-zinc-200 text-zinc-500 hover:border-zinc-300 h-10"
        >
          Отмена
        </Button>
      )}
      {mode === "inline" ? (
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || uploading}
          className="flex-1 bg-rose-500 hover:bg-rose-600 text-white h-10 font-semibold"
        >
          {uploading ? "Загружаем фото..." : isPending ? "Сохраняем..." : "Добавить в каталог"}
        </Button>
      ) : (
        <Button
          type="submit"
          form="catalog-form"
          disabled={isPending || uploading}
          className="flex-1 bg-rose-500 hover:bg-rose-600 text-white h-10 font-semibold"
        >
          {uploading ? "Загружаем фото..." : isPending ? "Сохраняем..." : flower ? "Сохранить" : "Добавить в каталог"}
        </Button>
      )}
      {flower && !onSaved && (
        <Button
          type="button"
          variant="outline"
          onClick={handleArchive}
          disabled={isPending}
          className="border-zinc-200 text-zinc-500 hover:border-red-200 hover:text-red-600 hover:bg-red-50 h-10"
        >
          Удалить
        </Button>
      )}
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────────

  if (mode === "inline") {
    return (
      <>
        <div
          className="flex-1 overflow-y-auto"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            const tag = (e.target as HTMLElement).tagName.toLowerCase()
            if (tag === "input" || tag === "select") e.preventDefault()
          }}
        >
          {formCards}
        </div>
        {errorBanner}
        {actionBar}
      </>
    )
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[580px] sm:max-w-[580px] flex flex-col p-0 bg-zinc-50">
        <SheetHeader className="px-6 pt-6 pb-4 bg-white border-b border-zinc-200">
          <SheetTitle className="text-base font-bold text-zinc-900">
            {flower ? "Редактировать товар" : "Новый товар"}
          </SheetTitle>
        </SheetHeader>
        <form id="catalog-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          {formCards}
        </form>
        {errorBanner}
        {actionBar}
      </SheetContent>
    </Sheet>
  )
}
