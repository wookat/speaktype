# 参与贡献 / Contributing

感谢你对 SpeakType 的兴趣！Issue、PR、翻译、文档都欢迎。

## 开发环境

- Windows 10/11 x64，Node.js ≥ 20
- 桌面版代码在 `desktop/`：

```bash
cd desktop
npm install
npm run dev        # 开发模式（Electron）
npm run typecheck  # 提交前必须通过
npm run build
npm run pack       # NSIS 安装包 → release/
```

## 提交 PR

1. Fork 并从 `main` 拉分支。
2. 保持改动聚焦：一个 PR 解决一件事。
3. `npm run typecheck` 与 `npm run build` 必须通过。
4. 涉及界面文案时，`src/shared/locales/` 下中英文都要补（文件为 UTF-8，注意编辑器编码）。
5. PR 描述解释「为什么」，不只是「改了什么」。

## 添加语言

复制 `desktop/src/shared/locales/en.ts` 为新语言文件，翻译全部键值，然后在 `desktop/src/shared/i18n.ts` 的 `UI_LANGUAGES` 注册即可。

## 安全与隐私红线

- 不得提交任何 API Key、Cookie、Token（包括测试用的）。
- 不得引入向 SpeakType 自有服务上传用户数据的代码——本项目没有也不应有自己的后端。
- 新增依赖请选择发布 ≥7 天的版本，避免供应链风险。

## 报告 Bug

请附：系统版本、SpeakType 版本（关于页）、复现步骤、`%APPDATA%\SpeakType\logs\main.log` 相关片段（注意先删掉可能包含的敏感内容）。

## License

贡献即表示你同意你的代码以 [MIT](LICENSE) 协议发布。
