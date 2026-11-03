/**
 * Каталог зацикленных роликов с движениями.
 *
 * Файлы лежат в public/loops/ как <id>.mp4 (H.264, 640×640, без звука)
 * и <id>.webp — постер первого кадра на время загрузки ролика.
 * Фон у роликов не вырезается: на светлом фоне сайта было видно обводку
 * по контуру, поэтому ролик целиком показывается в круглой рамке.
 *
 * С 21.09.2026 ролики — 3D-маскот из Higgsfield. Вертикальная генерация
 * лежит на студийном фоне с растворёнными краями, а из неё вырезан отрезок,
 * который повторяется без рывка. Пересборка: scripts/build-loops-v2.py,
 * найденные петли — scripts/loops-v2-manifest.json.
 * duration — длительность одного цикла в секундах.
 *
 * С 27.10.2026 есть второй поток — «Спина и осанка» (id потока 'back'): у
 * него свой маскот, парень, и свои ролики back-*. Пересборка:
 * scripts/build-loops-back.py, петли и вердикты стыка —
 * scripts/loops-back-manifest.json. Записи — в конце каталога.
 */

import { asset } from '../lib/asset'

/**
 * Вид движения — чтобы соседние движения в круге плеера были разными
 * (createRotation в src/lib/deck.ts):
 *   • steps — ноги переступают: шаги, ходьба, бег. Почти половина каталога,
 *     и со стороны они похожи друг на друга — отличаются в основном руками;
 *   • legs — колени, прыжки, выпады, твист;
 *   • arms — ноги почти на месте, работают руки.
 * Новое движение — впишите вид по тому, что делают ноги.
 *
 * В потоке «Спина» ноги стоят на месте во всех движениях, и вид по ногам
 * сделал бы их одинаковыми — круг перестал бы что-либо разводить. Поэтому
 * там вид — по тому, что работает:
 *   • arms — плечи и руки (вращения, подъёмы, вытяжение, раскрытие);
 *   • neck — шея и голова;
 *   • torso — корпус: наклон или поворот.
 * Круг сравнивает виды только внутри набора одного потока, так что arms у
 * кардио и у спины друг другу не мешают.
 */
export type MoveKind = 'steps' | 'legs' | 'arms' | 'neck' | 'torso'

export type Loop = {
  id: string
  title: string
  duration: number
  /**
   * Шагов в минуту — примерная оценка для счётчика шагов.
   *
   * Считать шаги нам нечем: акселерометра у сайта нет. Поэтому число
   * прикинуто по темпу самого ролика — бег чаще, махи руками почти не
   * «шагают». Отсюда «~» рядом с шагами везде в интерфейсе.
   */
  stepsPerMinute: number
  kind: MoveKind
  /**
   * Семейство — движения, которые со стороны выглядят почти одинаково
   * (09.10.2026). Круг плеера разносит членов одного семейства как можно
   * дальше друг от друга и равномерно (createRotation в src/lib/deck.ts).
   *
   * Вида (kind) для этого мало: он разводит только соседей. Подписчица при
   * смене раз в 30 секунд видела «одно и то же движение за 10 минут 4 раза»:
   * все 21 движение были разными, но четыре из них — скрещивания рук
   * (крест-накрест с шагом → через одно скрещивания с шагом → крест-накрест →
   * скрещивания внизу).
   *
   * Семейства: crosses — скрещивания рук; punches — удары и стойка боксёра;
   * reach — руки вверх и жим; knee — колено к локтю и подъёмы колен; twist —
   * твист и скручивания с шагом; stepout — шаг в сторону или врозь с руками;
   * run — бег; walk — ходьба и шаг на месте. Движение, не похожее ни на одно
   * другое, — само себе семейство: family = собственный id.
   *
   * Новое движение — впишите семейство движения, на которое оно похоже со
   * стороны (по рукам и общему рисунку, а не по ногам — ноги уже учитывает
   * kind); не похоже ни на одно — его id. Скрытые движения (HIDDEN_MOVES в
   * src/data/streams.ts) в круг не попадают, но семейство у них тоже вписано,
   * чтобы при возвращении ничего не забыть.
   */
  family: string
  /**
   * Версия файла ролика, если его заменили под тем же именем. Попадает в
   * адрес (?v=…): nginx отдаёт роликам и постерам недельный кэш, и без новой
   * версии в адресе телефон ещё неделю показывал бы старый файл.
   */
  rev?: number
}

export const LOOPS: Record<string, Loop> = {
  'walk-in-place': { id: 'walk-in-place', title: 'Ходьба на месте', duration: 1.875, stepsPerMinute: 110, kind: 'steps', family: 'walk' },
  'arms-up': { id: 'arms-up', title: 'Руки вверх', duration: 1.917, stepsPerMinute: 60, kind: 'arms', family: 'reach' },
  'knee-lifts': { id: 'knee-lifts', title: 'Подъёмы колен', duration: 3.333, stepsPerMinute: 120, kind: 'legs', family: 'knee' },
  punches: { id: 'punches', title: 'Удары руками', duration: 1.917, stepsPerMinute: 60, kind: 'arms', family: 'punches' },
  // скрыт до перегенерации: рваный стык петли (src/data/streams.ts, HIDDEN_MOVES)
  'side-steps': { id: 'side-steps', title: 'Приставные шаги', duration: 3.125, stepsPerMinute: 110, kind: 'steps', family: 'side-steps' },
  // скрыт до перегенерации: рывок на стыке петли (src/data/streams.ts, HIDDEN_MOVES)
  'diagonal-swings': { id: 'diagonal-swings', title: 'Махи по диагонали', duration: 1.833, stepsPerMinute: 40, kind: 'arms', family: 'diagonal-swings' },
  'step-out-arms': { id: 'step-out-arms', title: 'Шаг в сторону, руки врозь', duration: 1.833, stepsPerMinute: 100, kind: 'steps', family: 'stepout' },
  // скрыт до перегенерации: рваный стык петли (src/data/streams.ts, HIDDEN_MOVES)
  'run-in-place': { id: 'run-in-place', title: 'Бег на месте', duration: 3.75, stepsPerMinute: 150, kind: 'steps', family: 'run' },
  'punches-up': { id: 'punches-up', title: 'Удары вверх', duration: 1.958, stepsPerMinute: 60, kind: 'arms', family: 'punches' },
  'side-step-reach': { id: 'side-step-reach', title: 'Шаг в сторону, рука вверх', duration: 3.5, stepsPerMinute: 100, kind: 'steps', family: 'reach' },
  'knee-to-elbow': { id: 'knee-to-elbow', title: 'Колено к локтю', duration: 1.833, stepsPerMinute: 110, kind: 'legs', family: 'knee' },
  'arm-crosses': { id: 'arm-crosses', title: 'Скрещивания рук', duration: 1.917, stepsPerMinute: 40, kind: 'arms', family: 'crosses' },
  'step-arm-swing': { id: 'step-arm-swing', title: 'Шаг с махом руки', duration: 1.875, stepsPerMinute: 100, kind: 'steps', family: 'stepout' },
  'dance-steps': { id: 'dance-steps', title: 'Танцевальные шаги', duration: 1.958, stepsPerMinute: 110, kind: 'steps', family: 'dance-steps' },
  'overhead-press': { id: 'overhead-press', title: 'Жим руками вверх', duration: 1.792, stepsPerMinute: 60, kind: 'arms', family: 'reach' },
  'boxer-steps': { id: 'boxer-steps', title: 'Шаги в стойке боксёра', duration: 1.875, stepsPerMinute: 100, kind: 'steps', family: 'punches' },
  jog: { id: 'jog', title: 'Бег трусцой', duration: 1.792, stepsPerMinute: 140, kind: 'steps', family: 'run' },
  'elbow-raises': { id: 'elbow-raises', title: 'Локти вверх по очереди', duration: 1.75, stepsPerMinute: 60, kind: 'arms', family: 'elbow-raises' },
  // скрыт до перегенерации: рваный стык петли (src/data/streams.ts, HIDDEN_MOVES)
  'arm-scissors': { id: 'arm-scissors', title: 'Ножницы руками', duration: 1.917, stepsPerMinute: 100, kind: 'arms', family: 'crosses' },
  twist: { id: 'twist', title: 'Твист', duration: 1.958, stepsPerMinute: 100, kind: 'legs', family: 'twist' },
  'chest-crosses': { id: 'chest-crosses', title: 'Руки крест-накрест', duration: 3.542, stepsPerMinute: 40, kind: 'arms', family: 'crosses' },
  'step-clap': { id: 'step-clap', title: 'Шаг в сторону с хлопком', duration: 3.75, stepsPerMinute: 100, kind: 'steps', family: 'step-clap' },
  'jumping-jacks': { id: 'jumping-jacks', title: 'Прыжки, руки вверх', duration: 3.708, stepsPerMinute: 120, kind: 'legs', family: 'jumping-jacks' },
  'boxer-bounce': { id: 'boxer-bounce', title: 'Стойка боксёра', duration: 1.75, stepsPerMinute: 80, kind: 'arms', family: 'punches' },
  'chest-crosses-steps': { id: 'chest-crosses-steps', title: 'Крест-накрест с шагом', duration: 1.75, stepsPerMinute: 100, kind: 'steps', family: 'crosses' },
  'squat-steps': { id: 'squat-steps', title: 'Шаги в полуприседе', duration: 1.792, stepsPerMinute: 100, kind: 'steps', family: 'squat-steps' },
  'jazz-hands': { id: 'jazz-hands', title: 'Джазовые руки', duration: 1.75, stepsPerMinute: 40, kind: 'arms', family: 'jazz-hands' },
  'steps-reach-up': { id: 'steps-reach-up', title: 'Шаги с рукой вверх', duration: 1.792, stepsPerMinute: 100, kind: 'steps', family: 'reach' },
  'side-knee-crunch': { id: 'side-knee-crunch', title: 'Колено к локтю сбоку', duration: 1.833, stepsPerMinute: 110, kind: 'legs', family: 'knee' },
  'side-pushes': { id: 'side-pushes', title: 'Толчки в стороны', duration: 1.917, stepsPerMinute: 80, kind: 'arms', family: 'side-pushes' },
  'step-arm-out': { id: 'step-arm-out', title: 'Шаг, рука в сторону', duration: 2, stepsPerMinute: 100, kind: 'steps', family: 'stepout' },
  march: { id: 'march', title: 'Шаг на месте', duration: 1.917, stepsPerMinute: 110, kind: 'steps', family: 'walk' },
  'alternate-reach': { id: 'alternate-reach', title: 'Руки вверх по очереди', duration: 3.5, stepsPerMinute: 60, kind: 'arms', family: 'reach' },
  'arm-crosses-steps': { id: 'arm-crosses-steps', title: 'Скрещивания рук с шагом', duration: 1.75, stepsPerMinute: 100, kind: 'steps', family: 'crosses' },
  // скрыт до перегенерации: рваный стык петли (src/data/streams.ts, HIDDEN_MOVES)
  'twist-knee': { id: 'twist-knee', title: 'Скручивания с коленом', duration: 1.75, stepsPerMinute: 110, kind: 'legs', family: 'knee' },
  'arms-to-shoulders': { id: 'arms-to-shoulders', title: 'Руки к плечам', duration: 1.875, stepsPerMinute: 60, kind: 'arms', family: 'arms-to-shoulders' },
  'step-out-bent-arms': { id: 'step-out-bent-arms', title: 'Шаги врозь, руки согнуты', duration: 1.875, stepsPerMinute: 100, kind: 'steps', family: 'stepout' },
  'light-jog': { id: 'light-jog', title: 'Лёгкий бег', duration: 3.833, stepsPerMinute: 140, kind: 'steps', family: 'run' },
  // скрыт до перегенерации: рывок на стыке петли (src/data/streams.ts, HIDDEN_MOVES)
  'arm-swings-clap': { id: 'arm-swings-clap', title: 'Махи руками с хлопком', duration: 1.375, stepsPerMinute: 40, kind: 'arms', family: 'arm-swings-clap' },
  'side-lunges': { id: 'side-lunges', title: 'Выпады в стороны', duration: 1.75, stepsPerMinute: 80, kind: 'legs', family: 'side-lunges' },
  'low-crosses': { id: 'low-crosses', title: 'Скрещивания рук внизу', duration: 1.875, stepsPerMinute: 40, kind: 'arms', family: 'crosses' },
  'steps-arm-swings': { id: 'steps-arm-swings', title: 'Шаги с махами рук', duration: 1.792, stepsPerMinute: 110, kind: 'steps', family: 'stepout' },
  'diagonal-punches': { id: 'diagonal-punches', title: 'Удары по диагонали', duration: 1.75, stepsPerMinute: 60, kind: 'arms', family: 'punches' },
  'twist-steps': { id: 'twist-steps', title: 'Скручивания с шагом', duration: 2, stepsPerMinute: 100, kind: 'steps', family: 'twist' },
  'arms-up-steps': { id: 'arms-up-steps', title: 'Руки вверх с шагом', duration: 3.75, stepsPerMinute: 80, kind: 'steps', family: 'reach' },

  /*
   * ─── Поток «Спина и осанка» (27.10.2026) ───
   *
   * Названия и длительность цикла — из scripts/loops-back-manifest.json.
   * Вид (kind) здесь — по работающей части тела, см. MoveKind.
   *
   * Шагов нет ни в одном: парень стоит на месте и тянется, а счётчик шагов
   * у нас — оценка по темпу ног (см. stepsPerMinute). Поэтому 0: минуты в
   * движении засчитываются, а шаги «Спина» не прибавляет.
   *
   * Семейства: overhead — руки согнуты «воротами» над плечами (вращения в
   * плечах, подъём из W, руки вверх — локти вниз): со стороны это одна и та
   * же поза, круг разносит их подальше; opener — руки раскрыты в стороны
   * (раскрытие рук и раскрытие с поворотом). Остальные — сами себе семейство.
   *
   * back-forward-reach в манифесте — «на грани» по общей оценке стыка, но по
   * проверке готового файла разница на стыке (seam_mad 1,15) меньше
   * обычного шага между кадрами (1,18), то есть рывка не видно; владелец
   * включил его в поток.
   */
  'back-shoulder-rotations': { id: 'back-shoulder-rotations', title: 'Вращения в плечах', duration: 4.125, stepsPerMinute: 0, kind: 'arms', family: 'overhead', rev: 2 },
  'back-w-raise': { id: 'back-w-raise', title: 'Подъём рук из W', duration: 3.583, stepsPerMinute: 0, kind: 'arms', family: 'overhead' },
  'back-pull-downs': { id: 'back-pull-downs', title: 'Руки вверх, локти вниз', duration: 5, stepsPerMinute: 0, kind: 'arms', family: 'overhead' },
  'back-hip-hinge': { id: 'back-hip-hinge', title: 'Наклоны, руки на пояснице', duration: 4.125, stepsPerMinute: 0, kind: 'torso', family: 'back-hip-hinge' },
  'back-chin-tuck': { id: 'back-chin-tuck', title: 'Втягивание подбородка', duration: 2.667, stepsPerMinute: 0, kind: 'neck', family: 'back-chin-tuck' },
  'back-forward-reach': { id: 'back-forward-reach', title: 'Вытяжение рук вперёд', duration: 2.833, stepsPerMinute: 0, kind: 'arms', family: 'back-forward-reach' },
  'back-elbow-squeeze': { id: 'back-elbow-squeeze', title: 'Сведение локтей за головой', duration: 3.667, stepsPerMinute: 0, kind: 'arms', family: 'back-elbow-squeeze', rev: 2 },
  'back-neck-turns': { id: 'back-neck-turns', title: 'Повороты головы', duration: 2.583, stepsPerMinute: 0, kind: 'neck', family: 'back-neck-turns' },
  'back-open-twist': { id: 'back-open-twist', title: 'Раскрытие с поворотом', duration: 3.5, stepsPerMinute: 0, kind: 'torso', family: 'opener' },
  'back-chest-opener': { id: 'back-chest-opener', title: 'Раскрытие рук в стороны', duration: 2.667, stepsPerMinute: 0, kind: 'arms', family: 'opener' },
  /*
   * Перегенерированы 27.10.2026 вместо рваных: стык чистый (seam 1,14 / 1,02 /
   * 0,80). loop_check у первых двух 3,42 и 2,51 — кадры на стыке сверены
   * глазами, позы совпадают, рывка нет.
   *
   * rev: 2 у пяти роликов (эти три, «Вращения в плечах» и «Сведение локтей
   * за головой»): они сгенерировались сплющенными по высоте, парень в них
   * ниже и шире остальных. 03.11.2026 пропорции возвращены
   * scripts/unsquash-back-loops.py; у «Сведения локтей» новый адрес заодно
   * уводит и от старой тёмной версии, которую телефоны держали в кэше.
   */
  'back-palm-turns': { id: 'back-palm-turns', title: 'Повороты рук в стороны', duration: 3.458, stepsPerMinute: 0, kind: 'arms', family: 'opener', rev: 2 },
  'back-pelvic-tilt': { id: 'back-pelvic-tilt', title: 'Наклоны таза', duration: 3.583, stepsPerMinute: 0, kind: 'torso', family: 'back-pelvic-tilt', rev: 2 },
  'back-arm-raises': { id: 'back-arm-raises', title: 'Подъёмы рук вверх', duration: 3.833, stepsPerMinute: 0, kind: 'arms', family: 'overhead', rev: 2 },

  /*
   * Ещё три ролика «Спины» лежат в public/loops/, но в поток не входят —
   * ждут решения владельца (перегенерация 27.10 не помогла). Решит взять —
   * раскомментируйте запись и впишите id в BACK_MOVES (src/data/streams.ts).
   * Вид и семейство уже подобраны.
   *
   * стык рваный (seam 2,31; loop_check 1,73):
   * 'back-arms-up-bend': { id: 'back-arms-up-bend', title: 'Наклоны с руками вверх', duration: 4.708, stepsPerMinute: 0, kind: 'torso', family: 'fold' },
   * стык рваный (seam 1,70; loop_check 1,56):
   * 'back-standing-cat': { id: 'back-standing-cat', title: 'Кошка стоя', duration: 3.375, stepsPerMinute: 0, kind: 'torso', family: 'back-standing-cat' },
   * не петля — наклон один раз, дальше стоит (seam 26,01):
   * 'back-forward-fold': { id: 'back-forward-fold', title: 'Наклоны к коленям', duration: 1.583, stepsPerMinute: 0, kind: 'torso', family: 'fold' },
   */
}

/**
 * Оценка шагов за столько-то секунд этого движения.
 *
 * Живёт рядом с каталогом, а не в chunks.ts: и очередь кусков, и плеер, и
 * заполнение демо-истории считают шаги одинаково, а импорт chunks.ts тянет
 * за собой весь клиент API.
 */
export function stepsFor(moveId: string, seconds: number): number {
  const perMinute = LOOPS[moveId]?.stepsPerMinute ?? 0
  return Math.round((Math.max(0, seconds) * perMinute) / 60)
}

/**
 * Шагов в секунду этого движения — для счётчиков, которые тикают ежесекундно.
 *
 * Округлять каждую секунду нельзя: у танцевальных шагов это 110/60 ≈ 1.83, и
 * восемь округлённых секунд дали бы 16 шагов вместо 15. Поэтому копится
 * дробное число, а округление остаётся на показ.
 */
export function stepRate(moveId: string): number {
  return (LOOPS[moveId]?.stepsPerMinute ?? 0) / 60
}

/** Сколько секунд крутится одно движение, прежде чем сменится следующим. */
export const SECONDS_PER_MOVE = 30

/** «?v=2» для заменённого ролика (Loop.rev), пусто для остальных. */
function revQuery(id: string): string {
  const rev = LOOPS[id]?.rev
  return rev ? `?v=${rev}` : ''
}

export function loopSrc(id: string): string {
  return asset(`loops/${id}.mp4`) + revQuery(id)
}

/** Первый кадр ролика: показывается, пока видео ещё не готово играть. */
export function loopPoster(id: string): string {
  return asset(`loops/${id}.webp`) + revQuery(id)
}

/**
 * Ролик в круге на главной (правка Димы 06.10.2026: вместо маскота — кружок с
 * упражнением, бесконечно по кругу). «Шаг в сторону, рука вверх»: шаг вбок и
 * рука вверх по очереди. Не step-arm-out и не step-arm-swing — в них размыта
 * правая рука.
 *
 * Строку читает и scripts/build-sw.mjs — постер этого ролика в предкэше,
 * поэтому вид объявления (одна строка, id в одинарных кавычках) не менять.
 */
export const LANDING_LOOP = 'side-step-reach'
