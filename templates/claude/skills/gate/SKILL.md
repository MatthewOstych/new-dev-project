---
name: gate
description: Полная приёмка изменения одной цепочкой: линт, типы, размер файлов, prettier, сборки веба, бэкенда и мобилок. Запускать перед тем, как сообщить, что изменение готово.
---

# Приёмка изменения

Одна и та же цепочка после каждого этапа работы. Результат сообщать таблицей,
провал с выводом в блоке кода, а не пересказом. Шаги платформ, которых
изменение не касается, можно пропустить и сказать об этом.

```bash
npm run lint
npm run typecheck
node scripts/check-file-size.mjs
npx prettier --check .
npm test --if-present
npm run build
```

<!-- [ios] -->
iOS (`{{IOS_DIR}}`):

<!-- [ios] -->
```bash
(cd {{IOS_DIR}} && xcodegen generate && swiftlint --strict)
xcodebuild -project {{IOS_DIR}}/{{APP}}.xcodeproj -scheme {{APP}} \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet build
```

<!-- [android] -->
Android (`{{ANDROID_DIR}}`):

<!-- [android] -->
```bash
(cd {{ANDROID_DIR}} && ./gradlew --quiet --no-daemon -Pkotlin.compiler.execution.strategy=in-process \
  ktlintCheck detekt testDebugUnitTest assembleDebug)
```

Порядок важен: линт и типы дешёвые и ловят большинство ошибок, сборки самые
долгие и идут последними. Провалился ранний шаг: чинить и начинать сверху, а не
продолжать вниз.

## Что покрывает каждый шаг

- `npm run lint`: границы архитектуры из `eslint.config.mjs` и потолок строк.
- Веб: двери сервисов и UI, изоляция библиотеки UI, голые примитивы вне `src/ui`. <!-- [web] -->
- Бэк: чужой модуль только через `index.js`, Drizzle только в репозиториях. <!-- [railway] -->
- Функции: фича не импортирует соседнюю фичу. <!-- [firebase] -->
- `check-file-size.mjs`: тот же потолок одинаково для TS, Swift и Kotlin.
- `swiftlint --strict`: размер типов и функций, `views` не зовут сервисы, `ui` не знает про вью-модели и сервисы. <!-- [ios] -->
- `testDebugUnitTest` включает `ArchitectureTest` (Konsist): слои Android зависят сверху вниз. <!-- [android] -->
- `npm run build` ловит то, что типы не видят: серверный модуль в клиентском компоненте, сломанный `metadata`. <!-- [web] -->

## Чего здесь нет

Поведения в браузере и на устройстве. Экран за логином смотреть через превью
(у Railway после `/dev-login`), мобилку через симулятор.
