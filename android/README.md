# SpeakType 手机麦克风（Android）

把手机变成电脑的麦克风：按住说话，音频经中转服务直通电脑，文字落到电脑光标处。

应用本体只是中转服务托管的手机端页面（`relay/src/phone.ts`）的一个 WebView 壳，
逻辑全在网页里，所以桌面端和网页端一起升级，APK 不用重发。

> 不想装 APK 也行：手机扫桌面端的二维码打开网页，点浏览器菜单里的「添加到主屏幕」，
> 效果一样（PWA：有图标、全屏、无地址栏）。

## 使用

1. 电脑上打开 SpeakType → 设置 → 麦克风与音频 → 打开「手机当麦克风」，连接方式选「公网中转」。
2. 手机装上 APK 打开，扫二维码或手输电脑上显示的 12 位配对码。
3. 按住圆钮说话，松手，文字落到电脑光标处。

配对码存在本机，下次打开自动连回同一台电脑。长按界面空白处可改中转服务地址（自部署 Worker 用）。

## 自行构建

需要 JDK 17 + Android SDK（platform 34、build-tools 34）。

```bash
keytool -genkeypair -keystore app/speaktype.keystore -alias speaktype \
  -storepass speaktype -keypass speaktype -keyalg RSA -keysize 2048 \
  -validity 3650 -dname "CN=SpeakType, O=SpeakType"
echo "sdk.dir=/path/to/android-sdk" > local.properties
gradle assembleRelease
```

产物：`app/build/outputs/apk/release/app-release.apk`。

签名密钥不进仓库，也没有上架应用商店，安装时系统会提示「来自未知来源」，允许即可。
