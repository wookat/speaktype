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
    versionCode = 9
    versionName = "0.17.0"
  }

  signingConfigs {
    // æœªä¸Šæž¶ï¼Œç”¨ä»“åº“å¤–çš„æœ¬åœ°å¯†é’¥è‡ªç­¾ï¼Œä¿è¯ä»»ä½•äºº build å‡ºæ¥å°±èƒ½è£…
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
  // å¯¹é½ä¼ é€’ä¾èµ–é‡Œçš„ kotlin-stdlib ç‰ˆæœ¬ï¼Œé¿å… jdk7/jdk8 æ‹†åˆ†åŒ…ä¸Žæ–°ç‰ˆé‡å¤ç±»
  implementation(platform("org.jetbrains.kotlin:kotlin-bom:1.8.22"))
  implementation("androidx.appcompat:appcompat:1.7.0")
}
