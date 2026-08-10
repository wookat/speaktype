plugins {
  id("com.android.application")
}

android {
  namespace = "com.speaktype.mic"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.speaktype.mic"
    minSdk = 24
    targetSdk = 34
    versionCode = 1
    versionName = "0.9.0"
  }

  signingConfigs {
    // 未上架，用仓库外的本地密钥自签，保证任何人 build 出来就能装
    create("selfsigned") {
      storeFile = file(System.getenv("SPEAKTYPE_KEYSTORE") ?: "speaktype.keystore")
      storePassword = System.getenv("SPEAKTYPE_KEYSTORE_PASSWORD") ?: "speaktype"
      keyAlias = System.getenv("SPEAKTYPE_KEY_ALIAS") ?: "speaktype"
      keyPassword = System.getenv("SPEAKTYPE_KEY_PASSWORD") ?: "speaktype"
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("selfsigned")
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

dependencies {
  // 对齐传递依赖里的 kotlin-stdlib 版本，避免 jdk7/jdk8 拆分包与新版重复类
  implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
  implementation("androidx.appcompat:appcompat:1.7.0")
}
