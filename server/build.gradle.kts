plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    application
}

application {
    mainClass.set("aistages.server.ApplicationKt")
}

val appDistDir = project(":app").layout.buildDirectory.dir("dist/wasmJs/developmentExecutable")

tasks.named<JavaExec>("run") {
    dependsOn(":app:wasmJsBrowserDevelopmentExecutableDistribution")
    systemProperty("app.static.dir", appDistDir.get().asFile.absolutePath)
    systemProperty("app.port", findProperty("port") ?: "8080")
}

dependencies {
    implementation(project(":util"))
    implementation(project(":shared"))
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    implementation(libs.ktor.server.content.negotiation)
    implementation(libs.ktor.server.cors)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.logback)
    testImplementation(kotlin("test"))
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation("io.ktor:ktor-server-test-host:3.4.3")
    testImplementation("io.ktor:ktor-client-content-negotiation:3.4.3")
}
