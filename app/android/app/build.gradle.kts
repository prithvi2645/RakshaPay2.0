plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.rakshapay.rakshapay"
    // Pinned rather than flutter.compileSdkVersion: several plugin AARs
    // (onnxruntime's exifinterface transitive dep, others) each demand a
    // different compileSdk floor. 36 is the highest value AGP 9.0.1 still
    // recommends and clears every floor seen so far.
    compileSdk = 36
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "com.rakshapay.rakshapay"
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    packaging {
        jniLibs {
            // The ONNX Runtime binding opens libonnxruntime.so through Dart FFI
            // by soname. With the modern default (extractNativeLibs=false)
            // nothing gets written to /data/data/<pkg>/lib/ at install, so
            // dlopen can't resolve it and the risk engine fails to start.
            useLegacyPackaging = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
