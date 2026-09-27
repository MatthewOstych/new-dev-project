# Android: Jetpack Compose

Папка: `android/` (основа веб) или `mobile/android/` (основа приложение). Один
модуль `app`, слои пакетами, границы держат тест Konsist и detekt. minSdk 26,
compile и target последние стабильные.

## Создание

Мастер Android Studio агенту недоступен, проект пишется руками:

1. **Опорная точка по версиям:** `templates/android/libs.versions.toml`, набор,
   проверенный полным прогоном 2026-09-22: AGP 9.4.1 со встроенным Kotlin,
   Kotlin 2.4.20, KSP 2.3.12, Hilt 2.60.1, Compose BOM 2026.09.00, Konsist
   0.17.3, detekt 2.0.0-alpha.6, ktlint-gradle 14.2.0, Gradle 9.7.1, compile и
   target SDK 37, min 26. При создании сверить каждую версию с Maven Central и
   Google Maven и поднять до последней стабильной, если проект собирается.
   - Встроенный Kotlin AGP 9 берёт версию KGP с classpath: в корневом
     `build.gradle.kts` (`templates/android/build.gradle.kts`) плагин
     `org.jetbrains.kotlin.android` объявлен с `apply false` и поднимает её до
     нашей, в модуле он не применяется.
   - Версии KSP больше не привязаны к версии Kotlin (2.3.x работает с 2.4.x).
   - `hiltViewModel()` живёт в `androidx.hilt:hilt-lifecycle-viewmodel-compose`.
2. **Gradle wrapper:** `gradle wrapper --gradle-version <последняя>`. Нет
   `gradle`: `brew install gradle` (сказать владельцу). Wrapper скачивает
   дистрибутив Gradle, поэтому перед ним та же проверка места, что перед сборкой.
3. **JDK для сборки:** `JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"`,
   если системная Java новее, чем поддерживает AGP. SDK берётся из
   `~/Library/Android/sdk` (`local.properties` с `sdk.dir`, файл в `.gitignore`).
4. **Файлы:**
   - `settings.gradle.kts`, корневой `build.gradle.kts`;
   - `gradle/libs.versions.toml` (все версии только здесь), `gradle.properties`;
   - `app/build.gradle.kts`, `AndroidManifest.xml`, ресурсы темы и иконки.
5. **Плагины:**
   - `com.android.application`, `org.jetbrains.kotlin.plugin.compose`;
   - `org.jetbrains.kotlin.plugin.serialization`;
   - `com.google.devtools.ksp` + `com.google.dagger.hilt.android` (DI Hilt);
   - `org.jlleitschuh.gradle.ktlint`, detekt.
6. **Если Hilt, KSP или detekt не совместимы с текущими AGP и Kotlin:** не
   менять молча на другое. Записать в init-задачу, подобрать совместимые
   версии; не вышло, сказать владельцу.
7. `config/detekt.yml` из `templates/android/`, `buildUponDefaultConfig = true`.
   Kotlin 2.4 поддерживает только detekt 2.x (плагин `dev.detekt`), а она пока
   существует лишь как alpha. Это осознанное исключение из правила «последняя
   стабильная»: записать в init-задачу и перейти на стабильную 2.x, когда
   выйдет. Шаблон уже с ключами 2.x (`allowedLines`,
   `allowedFunctionParameters`, `allowedFunctionsPerFile`,
   `UnusedPrivateFunction`, без `build.maxIssues`). Правила по умолчанию, на
   которые натыкается скелет: `MatchingDeclarationName` (файл называется по
   своему главному объявлению, лишний enum выносится в свой файл) и
   `ReturnCount`/`ThrowsCount` (не больше двух).
8. `.editorconfig` из `templates/android/.editorconfig` в корень Android-проекта:
   ktlint иначе требует имена функций со строчной буквы и у Composable. Стиль
   `android_studio`, без висячих запятых; после генерации кода
   `./gradlew ktlintFormat`.
9. Вход через Google: `serverClientId` это web client ID из
   `gradle.properties` (`<slug>.googleServerClientId`, пусто до появления), а
   Android client ID с SHA-1 debug-ключа должен существовать в Google Cloud.

## Раскладка (решение владельца, пакеты в нижнем регистре)

```
app/src/main/kotlin/<pkg>/
  App.kt                  @HiltAndroidApp
  MainActivity.kt         @AndroidEntryPoint, setContent { AppTheme { AppNavHost() } }
  di/                     Hilt-модули: собирают сервисы
  navigation/             AppNavHost + типизированные маршруты (@Serializable); корневой «координатор»
  views/
    auth/                 Composable-экраны входа + components/ + helpers/
    account/<фича>/       экраны приложения по фичам, та же раскладка
  viewmodel/
    auth/  account/<фича>/   @HiltViewModel, StateFlow<UiState>, зеркалит views
  model/                  модели данных (@Serializable DTO и доменные)
  services/
    api/                  HTTP-клиент (Retrofit + OkHttp + kotlinx.serialization), базовый URL из BuildConfig
    auth/                 AuthService + SessionStore (токен в DataStore, шифрование ключом Keystore)
    analytics/            PostHog: папка + AGENTS.md (+ зависимость), или пустая, если отложен
    purchases/            PurchasesService: пустой класс, если владелец ждёт покупки
  ui/
    theme/                Color, Type, Spacing, AppTheme
    components/           PrimaryButton, AppTextField, …
app/src/test/kotlin/<pkg>/ArchitectureTest.kt    templates/android/ArchitectureTest.kt
```

## Правила

- **Сверху вниз:** views → viewmodel → services → model; ui ни о ком не
  знает. Держит `ArchitectureTest` (Konsist); пакеты `navigation`, `di` и
  корневые файлы собирают слои и в слои не входят.
- **Экран только рисует:** принимает `UiState` и лямбды действий. ViewModel
  берётся в обёртке-маршруте (`hiltViewModel()`) и не передаётся глубже.
- **Навигация как координатор:** фича отдаёт `NavGraphBuilder.<фича>(onX = …)`
  и `NavController.navigateTo<Фича>()`, `AppNavHost` связывает их. ViewModel
  не держит `NavController`.
- **UI только из `ui/`:** экраны не собирают кнопки и поля из Material3 сами.
- Потолок 500 строк на файл: `scripts/check-file-size.mjs` + detekt
  (`LargeClass`, `LongMethod`).
- `BuildConfig.API_BASE_URL`:
  - debug: `http://10.0.2.2:<API_PORT>` (localhost хоста из эмулятора, порт API проекта),
    cleartext только для debug через `networkSecurityConfig`;
  - release: пустая строка, пункт в init-задачу.

## Аутентификация

**Railway, Better Auth:**
- email через REST `/api/auth/*` с плагином `bearer`, токен из
  `set-auth-token` хранится в `SessionStore`, OkHttp-интерсептор
  добавляет `Authorization`;
- Google через Credential Manager (`androidx.credentials` + `googleid`):
  ID-токен уходит в Better Auth как `idToken`;
- восстановление сессии `GET /api/auth/get-session`, выход и удаление аккаунта
  (Google Play требует удаление).

**Firebase:** Firebase Auth SDK, `google-services.json` кладёт владелец.

Экраны: вход, регистрация, аккаунт с выходом и удалением. Больше ничего.

## Проверка фазы

`(cd <android> && ./gradlew --no-daemon -Pkotlin.compiler.execution.strategy=in-process ktlintCheck detekt testDebugUnitTest assembleDebug)`
с `JAVA_HOME` из пункта 3. Перед сборкой `df -h ~`: меньше 20 ГБ свободно, значит не собирать.
