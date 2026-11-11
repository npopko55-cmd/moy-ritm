/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Адрес API вместе с версией: http://localhost:8000/api/v1
   *
   * Задан — фронтенд работает с бэкендом. Не задан — включается демо-режим
   * (src/api/demo.ts): так живёт сборка для GitHub Pages, где сервера нет.
   */
  readonly VITE_API_URL?: string
  /** Номер счётчика Яндекс Метрики. Пусто — Метрика не грузится (src/lib/analytics.ts). */
  readonly VITE_YM_COUNTER_ID?: string
  /** id пикселя VK Ads (счётчик Top.Mail.ru). Пусто — пиксель не грузится. */
  readonly VITE_VK_PIXEL_ID?: string
  /** 1 — грузить счётчики без выбора в баннере cookies. Только после правки политики. */
  readonly VITE_ANALYTICS_NO_CONSENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** Ставит main.tsx перед отрисовкой; читает сторож запуска в index.html. */
  __moyRitmBooted?: boolean
}
