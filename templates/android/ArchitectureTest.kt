package {{PACKAGE}}

import com.lemonappdev.konsist.api.Konsist
import com.lemonappdev.konsist.api.architecture.KoArchitectureCreator.assertArchitecture
import com.lemonappdev.konsist.api.architecture.Layer
import org.junit.Test

// Слои Android зависят сверху вниз, и держит это тест, а не память:
// views → viewmodel → services → model, библиотека ui ни о ком не знает.
// Пакеты app, navigation и di собирают слои вместе и поэтому в слои не входят.
// Причины лежат в Documentation [{{PROJECT}}] (заметка про Android).
class ArchitectureTest {
    @Test
    fun `layers depend top-down`() {
        Konsist.scopeFromProduction().assertArchitecture {
            val views = Layer("views", "{{PACKAGE}}.views..")
            val viewModel = Layer("viewmodel", "{{PACKAGE}}.viewmodel..")
            val services = Layer("services", "{{PACKAGE}}.services..")
            val model = Layer("model", "{{PACKAGE}}.model..")
            val ui = Layer("ui", "{{PACKAGE}}.ui..")

            views.dependsOn(viewModel, model, ui)
            viewModel.dependsOn(services, model)
            services.dependsOn(model)
            model.dependsOnNothing()
            ui.dependsOnNothing()
        }
    }
}
