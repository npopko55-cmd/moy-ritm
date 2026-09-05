/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Адрес API вместе с версией: http://localhost:8000/api/v1
   *
   * Задан — фронтенд работает с бэкендом. Не задан — включается демо-режим
   * (src/api/demo.ts): так живёт сборка для GitHub Pages, где сервера нет.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
