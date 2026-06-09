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
import { Label } from "@/components/ui/label"
import { createClient } from "@/lib/supabase/client"
import {
  upsertFlower,
  uploadFlowerImage,
  addFlowerVariety,
  deleteFlowerVariety,
  addFlowerColor,
  deleteFlowerColor,
  archiveFlower,
  type FlowerWithDetails,
} from "@/app/actions/catalog"

const CATEGORIES = ["Срезка", "Зелень", "Упаковка", "Декор", "Аксессуары", "Горшечные"]
const UNITS = ["шт", "кг", "г", "рулон", "м", "уп", "л", "букет"]

interface Props {
  open: boolean
  flower: FlowerWithDetails | null
  onClose: () => void
}

export function CatalogFlowerForm({ open, flower, onClose }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: "",
    category: "Срезка",
    unit: "шт",
    description: "",
    florist_comment: "",
  })

  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile] = useState<File | null>(null)

  // Varieties management
  const [varieties, setVarieties] = useState<{ id?: string; name: string; size: string }[]>([])
  const [newVarietyName, setNewVarietyName] = useState("")
  const [newVarietySize, setNewVarietySize] = useState("")

  // Colors management
  const [colors, setColors] = useState<{ id?: string; name: string; hex_code: string }[]>([])
  const [newColorName, setNewColorName] = useState("")

  useEffect(() => {
    if (!open) return
    setError("")
    setPhotoFile(null)
    setPhotoPreview(null)

    if (flower) {
      setForm({
        name: flower.name,
        category: flower.category,
        unit: flower.unit,
        description: flower.description ?? "",
        florist_comment: flower.florist_comment ?? "",
      })
      setVarieties(flower.varieties.map((v) => ({ id: v.id, name: v.name, size: v.size ?? "" })))
      setColors(flower.colors.map((c) => ({ id: c.id, name: c.name, hex_code: c.hex_code ?? "" })))
    } else {
      setForm({ name: "", category: "Срезка", unit: "шт", description: "", florist_comment: "" })
      setVarieties([])
      setColors([])
    }
    setNewVarietyName("")
    setNewVarietySize("")
    setNewColorName("")
  }, [open, flower])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setError("Файл слишком большой. Максимум 5 МБ.")
      return
    }
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError("")
  }

  async function uploadPhoto(flowerId: string, file: File): Promise<string | null> {
    const supabase = createClient()
    const ext = file.name.split(".").pop() ?? "jpg"
    const path = `${flowerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from("product-photos")
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error || !data) return null
    const { data: { publicUrl } } = supabase.storage.from("product-photos").getPublicUrl(data.path)
    return publicUrl
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    startTransition(async () => {
      const result = await upsertFlower({
        id: flower?.id,
        name: form.name,
        category: form.category,
        unit: form.unit,
        description: form.description || undefined,
        florist_comment: form.florist_comment || undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      const flowerId = result.id!

      // Upload photo if selected
      if (photoFile) {
        setUploading(true)
        const url = await uploadPhoto(flowerId, photoFile)
        setUploading(false)
        if (url) {
          await uploadFlowerImage(flowerId, url, true)
        }
      }

      router.refresh()
      onClose()
    })
  }

  function handleAddVariety() {
    const name = newVarietyName.trim()
    if (!name) return
    if (flower?.id) {
      startTransition(async () => {
        const result = await addFlowerVariety(flower.id, name, newVarietySize.trim() || undefined)
        if (result.id) {
          setVarieties((v) => [...v, { id: result.id, name, size: newVarietySize.trim() }])
        }
        setNewVarietyName("")
        setNewVarietySize("")
        router.refresh()
      })
    } else {
      setVarieties((v) => [...v, { name, size: newVarietySize.trim() }])
      setNewVarietyName("")
      setNewVarietySize("")
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

  function handleAddColor() {
    const name = newColorName.trim()
    if (!name) return
    if (flower?.id) {
      startTransition(async () => {
        const result = await addFlowerColor(flower.id, name)
        if (result.id) {
          setColors((c) => [...c, { id: result.id, name, hex_code: "" }])
        }
        setNewColorName("")
        router.refresh()
      })
    } else {
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

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  })

  const currentPhoto = photoPreview ?? flower?.primary_image_url

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <SheetTitle className="text-base">
            {flower ? "Редактировать товар" : "Новый товар"}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <form id="catalog-form" onSubmit={handleSubmit}>
            {/* Photo upload */}
            <div className="px-6 pt-5 pb-4">
              <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block mb-2">
                Фото
              </Label>
              {currentPhoto ? (
                <div className="relative rounded-xl overflow-hidden border border-zinc-200 bg-zinc-50 h-48">
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
                  className="w-full h-36 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 hover:border-rose-300 hover:bg-rose-50/30 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-full bg-zinc-100 group-hover:bg-rose-100 flex items-center justify-center transition-colors">
                    <Camera className="h-5 w-5 text-zinc-400 group-hover:text-rose-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-600">Добавить фото</p>
                    <p className="text-xs text-zinc-400 mt-0.5">JPG, PNG, WebP · до 5 МБ</p>
                  </div>
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Base fields */}
            <div className="px-6 space-y-4 pb-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Наименование *
                </Label>
                <Input
                  {...field("name")}
                  placeholder="Роза, Тюльпан, Лента атласная..."
                  required
                  className="border-zinc-200 h-10"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Категория
                  </Label>
                  <select
                    {...field("category")}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                    Ед. учёта
                  </Label>
                  <select
                    {...field("unit")}
                    className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Описание
                </Label>
                <Input
                  {...field("description")}
                  placeholder="Краткое описание товара..."
                  className="border-zinc-200 h-10"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                  Комментарий флориста
                </Label>
                <Input
                  {...field("florist_comment")}
                  placeholder="Хранить при 4°С · особенности ухода..."
                  className="border-zinc-200 h-10"
                />
              </div>
            </div>

            {/* Varieties */}
            <div className="px-6 pb-4">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 space-y-3">
                <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block">
                  Сорта / Размеры
                </Label>
                {varieties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {varieties.map((v, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 bg-white border border-zinc-200 text-zinc-700 text-xs px-2.5 py-1 rounded-full"
                      >
                        {v.name}{v.size ? ` · ${v.size}` : ""}
                        <button type="button" onClick={() => handleRemoveVariety(i)} className="ml-0.5 text-zinc-400 hover:text-red-500 transition-colors">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newVarietyName}
                    onChange={(e) => setNewVarietyName(e.target.value)}
                    placeholder="Mondial, Red Naomi..."
                    className="border-zinc-200 h-9 text-sm flex-1"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddVariety())}
                  />
                  <Input
                    value={newVarietySize}
                    onChange={(e) => setNewVarietySize(e.target.value)}
                    placeholder="80 см"
                    className="border-zinc-200 h-9 text-sm w-20"
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
            </div>

            {/* Colors */}
            <div className="px-6 pb-6">
              <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 space-y-3">
                <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide block">
                  Цвета
                </Label>
                {colors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {colors.map((c, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 bg-white border border-zinc-200 text-zinc-700 text-xs px-2.5 py-1 rounded-full"
                      >
                        {c.name}
                        <button type="button" onClick={() => handleRemoveColor(i)} className="ml-0.5 text-zinc-400 hover:text-red-500 transition-colors">
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
                    className="border-zinc-200 h-9 text-sm flex-1"
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
            </div>

            {error && (
              <div className="px-6 pb-4">
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100">
                  {error}
                </p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-100 px-6 py-4 flex items-center gap-2">
          <Button
            type="submit"
            form="catalog-form"
            disabled={isPending || uploading}
            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white h-10"
          >
            {uploading ? "Загружаем фото..." : isPending ? "Сохраняем..." : flower ? "Сохранить" : "Добавить в каталог"}
          </Button>
          {flower && (
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
      </SheetContent>
    </Sheet>
  )
}
