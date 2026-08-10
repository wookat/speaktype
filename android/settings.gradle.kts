pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
    // 中央仓库偶发限流时的镜像兜底
    maven("https://maven.aliyun.com/repository/public")
    maven("https://maven.aliyun.com/repository/gradle-plugin")
  }
}

dependencyResolutionManagement {
  repositories {
    google()
    mavenCentral()
    maven("https://maven.aliyun.com/repository/public")
  }
}

rootProject.name = "SpeakType"
include(":app")
