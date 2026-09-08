// Regression suite for the shared AI bouquet prompt.
//
// This module is the single source of truth for the text the image provider
// actually receives, and its exact-count wording is load-bearing: the
// NANO-BANANA-PROMPT-COUNT stage proved that softeners like "Постарайся" or
// "около N" made the model render ~2 of 5 requested heads. These tests lock in
// the strict wording so a future edit cannot silently reintroduce that drift.
//
// Deliberately dependency-free: the module under test has zero imports, so
// these tests need no DB, no network, no env, and no mocks.

import { describe, expect, it } from "vitest"

import {
  buildBouquetImagePrompt,
  type BouquetPromptItem,
  type BouquetPromptParams,
} from "./buildBouquetImagePrompt"

/** Deterministic stand-ins for the Builder's controls. No production data. */
const PARAMS: BouquetPromptParams = {
  style: "Нежный",
  shape: "Круглый",
  wrapping: "Матовая бумага",
  occasion: "День рождения",
}

const ROSE_X5: BouquetPromptItem = {
  name: "Роза Эквадор",
  variety_name: "Be Sweet",
  variety_size: "90",
  color_name: "Розовый",
  quantity: 5,
}

describe("buildBouquetImagePrompt — exact counts", () => {
  it("states the per-item count, the total, and the not-more-not-less rule", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], PARAMS)

    // Per-item line carries the full variant identity and an exact count.
    expect(prompt).toContain(
      "- Роза Эквадор, Be Sweet, размер 90, цвет Розовый — РОВНО 5 шт."
    )

    // Total is stated as a heading and restated as a hard constraint.
    expect(prompt).toContain("СОСТАВ БУКЕТА — РОВНО 5 цветочных головок")
    expect(prompt).toContain(
      "На фотографии должно быть видно РОВНО 5 цветочных головок — не больше и не меньше."
    )
  })

  it("keeps the visibility rules that make the count countable", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], PARAMS)

    // A head that is hidden, merged or cropped cannot be counted by the viewer,
    // so these four clauses are part of the count guarantee, not decoration.
    expect(prompt).toContain("полностью видна")
    expect(prompt).toContain("отдельно различима")
    expect(prompt).toContain("не перекрыта")
    expect(prompt).toContain("не обрезана")
  })

  it("ranks exact count above visual density", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], PARAMS)

    expect(prompt).toContain("точное количество важнее пышности")
    expect(prompt).toContain(
      "Показывай только раскрытые цветочные головки — не заменяй заявленные головки бутонами."
    )
  })
})

describe("buildBouquetImagePrompt — no approximation escape hatches", () => {
  it("contains none of the softeners that previously caused undercounting", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], PARAMS)

    expect(prompt).not.toContain("Постарайся")
    expect(prompt).not.toContain("большая часть головок")
    expect(prompt).not.toContain("визуальное ощущение")
    expect(prompt).not.toContain("Если точное количество сложно показать")

    // Matches the approximate-count construction ("около 5") rather than the
    // bare word, which could legitimately appear in unrelated future wording.
    expect(prompt).not.toMatch(/около\s*\d/)
  })

  it("forbids the model from adding heads beyond the stated count", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], PARAMS)

    expect(prompt).toContain(
      "- дополнительные цветочные головки или бутоны сверх указанного количества;"
    )
  })
})

describe("buildBouquetImagePrompt — multiple items", () => {
  const ITEMS: BouquetPromptItem[] = [
    {
      name: "Роза Эквадор",
      variety_name: "Be Sweet",
      variety_size: "90",
      color_name: "Розовый",
      quantity: 3,
    },
    {
      name: "Тюльпан",
      variety_name: null,
      variety_size: null,
      color_name: "Белый",
      quantity: 2,
    },
  ]

  it("keeps each item's own count and sums them into the total", () => {
    const prompt = buildBouquetImagePrompt(ITEMS, PARAMS)

    expect(prompt).toContain(
      "- Роза Эквадор, Be Sweet, размер 90, цвет Розовый — РОВНО 3 шт."
    )
    expect(prompt).toContain("- Тюльпан, цвет Белый — РОВНО 2 шт.")

    expect(prompt).toContain("СОСТАВ БУКЕТА — РОВНО 5 цветочных головок")
    expect(prompt).toContain(
      "На фотографии должно быть видно РОВНО 5 цветочных головок — не больше и не меньше."
    )
  })

  it("omits absent per-item variant fields instead of printing placeholders", () => {
    const prompt = buildBouquetImagePrompt(ITEMS, PARAMS)

    // The tulip has no variety/size: those segments must simply not appear.
    expect(prompt).not.toContain("размер null")
    expect(prompt).not.toContain("undefined")
    expect(prompt).not.toContain("null")
  })
})

describe("buildBouquetImagePrompt — optional palette and comment", () => {
  it("includes both sections when they are provided", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], {
      ...PARAMS,
      palette: "пастельные тона, без красного",
      comment: "побольше зелени",
    })

    expect(prompt).toContain("ЦВЕТОВАЯ ГАММА:")
    expect(prompt).toContain(
      "Соблюдай указанную цветовую гамму: пастельные тона, без красного."
    )
    expect(prompt).toContain("ПОЖЕЛАНИЕ КЛИЕНТА:")
    expect(prompt).toContain("побольше зелени")
  })

  it("omits both sections entirely when null", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], {
      ...PARAMS,
      palette: null,
      comment: null,
    })

    expect(prompt).not.toContain("ЦВЕТОВАЯ ГАММА")
    expect(prompt).not.toContain("ПОЖЕЛАНИЕ КЛИЕНТА")
    expect(prompt).not.toContain("undefined")
    expect(prompt).not.toContain("null")
  })

  it("treats empty strings the same as absent values", () => {
    const prompt = buildBouquetImagePrompt([ROSE_X5], {
      ...PARAMS,
      palette: "",
      comment: "",
    })

    expect(prompt).not.toContain("ЦВЕТОВАЯ ГАММА")
    expect(prompt).not.toContain("ПОЖЕЛАНИЕ КЛИЕНТА")
  })
})

describe("buildBouquetImagePrompt — server/client drift guard", () => {
  it("appends the variety even when the name already repeats it", () => {
    // The client preview once carried a dedup guard the server never had, so
    // the two could render different text for the same bouquet. The shared
    // builder intentionally kept SERVER semantics: name and variety are both
    // emitted, repetition included. This asserts current behaviour so the
    // client-only guard cannot creep back in.
    const prompt = buildBouquetImagePrompt(
      [
        {
          name: "Роза Be Sweet",
          variety_name: "Be Sweet",
          quantity: 3,
        },
      ],
      PARAMS
    )

    expect(prompt).toContain("- Роза Be Sweet, Be Sweet — РОВНО 3 шт.")
  })
})
