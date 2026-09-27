# iOS: SwiftUI

Папка: `ios/` (основа веб) или `mobile/ios/` (основа приложение). Минимальная
версия iOS 17 (нужна для `@Observable`), Swift 6.

## Создание

1. `brew install xcodegen swiftlint`, если их нет (сказать владельцу, что
   ставится).
2. `project.yml` и `.swiftlint.yml` из `templates/ios/`, маркеры частей по
   правилу из `SKILL.md`. Пакеты SPM только нужные: `Firebase` (вариант
   Firebase), `GoogleSignIn` (вход через Google), `PostHog` (если не
   отложен). Версии последние стабильные с GitHub releases.
   `AGENTS.md` и `CLAUDE.md` исключены из бандла в шаблоне: без этого
   одинаковые имена из разных папок валят сборку.
3. `Config/Debug.xcconfig`, `Config/Release.xcconfig`:
   - Railway, `API_BASE_URL`: Debug `http:/$()/localhost:<API_PORT>` (трюк `$()`
     нужен, потому что `//` в xcconfig начинает комментарий), Release пустая
     строка до появления прод-адреса, пункт в init-задачу;
   - Firebase, `FIREBASE_EMULATOR_HOST`: Debug `localhost`, Release пусто.
   - вход через Google: `GOOGLE_IOS_CLIENT_ID` и `GOOGLE_IOS_URL_SCHEME`
     (перевёрнутый client ID) в обоих xcconfig; шаблон кладёт их в `GIDClientID`
     и `CFBundleURLTypes`. Провайдер в коде проверяет, что `GIDClientID` не
     пуст: пустой роняет приложение исключением SDK. Пока ID нет, пункт в
     «что сделать руками».
4. `xcodegen generate`. `.xcodeproj`, сгенерированные `Info.plist` и
   `.entitlements` в `.gitignore` (их пишет XcodeGen из `project.yml`),
   `Package.resolved` в git (правило в `templates/root/.gitignore`). Версия
   приложения берётся из `MARKETING_VERSION` и `CURRENT_PROJECT_VERSION`.
5. `http` на localhost в Debug разрешён в шаблоне (`NSAllowsLocalNetworking`).

## Раскладка (решение владельца)

```
<App>/
  App/                    <App>App.swift (@main), AppContainer: собирает сервисы, отдаёт координаторам
  coordinators/           AppCoordinator (auth ↔ account по состоянию сессии), AuthCoordinator, AccountCoordinator
  views/
    auth/                 экраны входа: <Screen>View.swift + components/ + helpers/
    account/<фича>/       экраны приложения по фичам, та же раскладка внутри
  viewModel/
    auth/  account/<фича>/   одна @Observable ViewModel на экран, зеркалит views
  model/                  модели данных: Codable DTO и доменные структуры
  services/
    api/                  только Railway: APIClient (URLSession, async/await), базовый URL из Info.plist, ошибки API
    auth/                 AuthService (протокол + реализация), SessionStore (Keychain)
    analytics/            PostHog: папка + AGENTS.md (+ SDK подключён), или пустая, если отложен
    purchases/            PurchasesService: пустой класс, если владелец ждёт покупки
  ui/                     библиотека UI: Theme (цвета, шрифты, отступы) + компоненты (PrimaryButton, TextField, …)
  Resources/              Assets.xcassets
```

## Правила

- **Сверху вниз:** App → coordinators → views → (viewModel, ui); viewModel →
  services → model. Обратных стрелок нет.
- **Вью только рисует.** Состояние и действия приходят из ViewModel, сервис
  во вью запрещён (SwiftLint `views_no_services`). Вью декомпозируется на
  `components/` своей фичи; мелкие чистые преобразования для показа лежат в
  `helpers/` рядом.
- **ViewModel:** `@Observable @MainActor final class`, не импортирует SwiftUI
  (правило `viewmodel_no_swiftui`), о навигации не знает. Переход наружу
  через замыкание или делегат (`onSignedIn`, `onOpenSettings`), решает
  координатор.
- **Координатор** владеет `NavigationStack` (path) и создаёт экраны вместе с
  их ViewModel, передавая сервисы из `AppContainer`.
- **Сервисы** приходят через `init` как протоколы. Синглтонов `.shared` нет,
  кроме того, что требует SDK.
- **UI только из `ui/`:** экраны не стилизуют примитивы сами. `ui/` не знает
  о сервисах, вью-моделях и навигации (правило `ui_no_domain`).
- **Модель** это данные: без SwiftUI и сервисов (правило `model_is_plain`).
- Потолок 500 строк на файл (`file_length`), плюс лимиты тела типа и функции.
- **Swift 6:** ViewModel и координаторы `@MainActor`. Не-`Sendable` типы SDK
  (например `FirebaseAuth.User`) не держать в свойствах и не передавать через
  границу `await`: брать свежими перед каждым вызовом
  (`auth.currentUser`). Сборка должна быть без предупреждений о data races.

## Аутентификация

**Railway, Better Auth:**
- вход и регистрация по email через REST `/api/auth/*`, плагин `bearer`:
  токен из заголовка `set-auth-token` хранится в Keychain и уходит
  заголовком `Authorization: Bearer`;
- Sign in with Apple через `AuthenticationServices`: `identityToken` уходит в
  Better Auth как `idToken` (провайдер apple);
- Google через `GoogleSignIn`: `idToken` уходит так же;
- восстановление сессии на старте: `GET /api/auth/get-session`;
- выход и удаление аккаунта обязательны (App Store 5.1.1(v)).

**Firebase:**
- `services/api/` нет: клиент ходит в Firebase SDK через `services/auth/`
  (и будущие сервисы данных), а не в свой API;
- `AppContainer` вызывает `FirebaseApp.configure()` один раз; в Debug, если
  `FIREBASE_EMULATOR_HOST` не пуст, Auth смотрит в эмулятор
  (`useEmulator(withHost:port: 9099)`);
- пока владелец не положил `GoogleService-Info.plist` (шаг «что сделать
  руками»), `FirebaseApp.configure()` без аргументов падает на запуске. В Debug
  без файла конфигурировать `FirebaseOptions` вручную с projectID `demo-<slug>`
  для эмулятора; проверить это первым запуском в симуляторе и записать итог в
  init-задачу;
- `SessionStore` слушает `addStateDidChangeListener`;
- удаление аккаунта через `user.delete()`; если Firebase требует недавний вход,
  экран просит войти заново, а не просто показывает ошибку.

Экраны: вход, регистрация, аккаунт с выходом и удалением. Больше ничего.

## Проверка фазы

- `(cd <ios> && xcodegen generate && swiftlint --strict)`.
- `xcodebuild -project <ios>/<App>.xcodeproj -scheme <App> -destination
  'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO -quiet build`.
- Если владелец хочет посмотреть: запуск в симуляторе (инструмент iOS
  Simulator), вход против локального API.
