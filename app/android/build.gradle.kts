allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

// Plugin subprojects hardcode their own Android settings in their own
// build.gradle, procedurally (old-style Groovy `compileSdkVersion 33`, a
// plain property assignment, not a declarative block) — so a plugins.withId
// override fired at plugin-application time gets silently overwritten a few
// lines later when that script keeps executing. gradle.projectsEvaluated
// runs only after every project (including plugin subprojects) has fully
// finished evaluating, so nothing left in any plugin's own script can still
// win the race against it. Same reasoning applies to the JVM target below —
// another_telephony sets its own Java compileOptions from an afterEvaluate
// callback that would otherwise outrace a plain top-level override too.
gradle.projectsEvaluated {
    allprojects {
        tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
            compilerOptions.jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
        tasks.withType<JavaCompile>().configureEach {
            sourceCompatibility = "17"
            targetCompatibility = "17"
        }
    }
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
