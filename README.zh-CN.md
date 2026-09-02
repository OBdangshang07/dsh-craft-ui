[English](README.md) | [简体中文](README.zh-CN.md)

# DSH Craft UI

一款非官方、高还原度的 Minecraft 风格 DeepSeek Harness 界面与玩法增强层。它不会改变 Harness 对操作和状态的实际控制，只会将这些能力重新呈现为兼顾效率与游戏感的 HUD。

发布的软件包可以完全独立运行：其中包含采用 MIT 许可证的原创像素美术、采用 OFL-1.1 许可证的 Fusion Pixel 界面字体，以及通过 Web Audio 实时合成的提示音。软件包不包含 Minecraft 的纹理、声音、字体、徽标或其他 Mojang/Microsoft 文件。

## 功能变化

- 可随时还原的“主世界白昼”和“深板岩之夜”主题。
- 原创九宫格面板、按钮、工具提示、图标、物品槽和世界纹理。
- 内置 Fusion Pixel 简体中文 WOFF2 字体，离线环境下也能保持一致显示。
- 将上下文压力显示为经验值栏；遥测数据未知时会明确显示为不可用，不会虚构数值。
- 将正在运行的工具调用显示为物品栏和工具提示框。
- 将模型和服务提供方显示为装备，将推理强度显示为附魔。
- 将待办事项和计划显示为任务日志。
- 将 Harness 原生的活动目标栏改造成 Minecraft 任务面板，并为上下文经验值栏预留空间。
- 将子代理显示为同伴列表，将待处理交互显示为确认警告。
- 回合完成时显示“进度达成”提示。
- 提供原创合成的点击音和进度达成音，默认关闭。
- 在不替换原生操作及风险说明的前提下，为设置、确认、提问和计划审查界面应用 Minecraft 风格。
- 采用 Java 版风格的“选项”导航：居中的双列选项按钮、独立的 HUD 与资源包子页面，以及底部的“完成/返回”按钮，不再使用桌面应用式标签页和下拉框。

## 安装与开发

需要 Node.js 22 或更高版本，以及兼容的 DeepSeek Harness 版本。

```sh
pnpm install
pnpm run verify
pnpm pack --pack-destination .generated/packs
dsh plugin --profile craft-ui-canary add .generated/packs/dsh-craft-ui-0.2.1.tgz
```

该插件是一个 DSH Host + Client 组合包。`cordis.patch.yml` 会插入稳定的 bundle 层；客户端使用 Harness 已公开的主题、插槽、连接、会话和对话服务。

## 本地 Minecraft 物品模式

打开 **Craft UI → 素材**，粘贴你合法持有的 `textures` 或 `items` 目录绝对路径，然后选择 **导入物品贴图**。导入功能只能通过本机回环地址上的 Harness 连接使用。插件内置的界面边框、按钮、物品槽、状态栏和背景仍然使用原创美术；从该目录读取的内容仅限单个物品图标。

导入器会：

- 只读取预先定义的物品语义白名单，不会遍历或复制整个目录；
- 要求使用绝对目录路径，并通过 `realpath` 解析每个选中文件，拒绝符号链接及任何逃逸出所选目录的路径；
- 校验 PNG/IHDR 文件头、16–256 像素范围内的正方形 2 次幂尺寸，以及每个物品 64 KB 的大小上限；
- 计算所选文件的哈希，并将私有缓存保存到 `$DSH_HOME/craft-ui/resource-packs/<sha256>`；
- 只把选中的物品 PNG 作为受大小限制的 data URL 发送给本机浏览器；
- 不在新缓存清单中持久保存源目录路径，不向客户端暴露该路径，也不会把导入文件加入 npm tarball。

已识别的物品语义包括命令执行、文件编辑、搜索/读取、网络访问、图像处理、模型装备、目标、任务、子代理、确认和进度状态。运行时音频始终使用原创合成声音。

使用 **清除缓存** 可以删除全部 Craft UI 私有资源缓存，并恢复原创素材套件。

## 界面尺寸

**Craft UI → 外观 → 界面尺寸** 提供三档真实布局缩放：**紧凑**、**标准**和**大号**。该设置会同时缩放 HUD 与 Craft UI 面板，而不是只改变边框粗细。在狭窄视口中，界面会自动采用安全的响应式尺寸，确保 Harness 原生控件始终可以操作。

## 字体行为

客户端会在构建时嵌入 `Fusion Pixel 10px Monospaced zh-Hans` 的 WOFF2 文件，因此界面不依赖系统字体或在线字体服务。同一份经过审查的字体文件、SIL Open Font License 1.1 许可证文本及内置组件的许可证声明均包含在 `assets/fonts/` 中。如果浏览器无法加载 WOFF2，样式表会回退到可读的系统等宽字体和中日韩字体。

## 无障碍与安全性

- 提供完整、减少和关闭三种动效模式；操作系统的“减少动态效果”偏好拥有最高优先级。
- 键盘焦点始终清晰可见。
- HUD 元素不会拦截指针操作，并会为原生任务、运行状态和操作控件动态避让。
- 响应式布局会优先隐藏非必要 HUD 元素，再缩小核心控件。
- 确认、提问和计划审查的实际行为始终由 Harness 管理。
- 禁用或卸载插件后，会恢复此前的 Harness 主题和文档配色方案。

## 兼容性

当前版本已针对 DeepSeek Harness `0.1.0-rc.8` 进行 Canary 测试。集成契约请参阅 [docs/COMPATIBILITY.md](docs/COMPATIBILITY.md)，素材边界请参阅 [docs/ASSET_POLICY.md](docs/ASSET_POLICY.md)。

## 验证

`pnpm run verify` 会重新生成原创素材、嵌入所有运行时纹理及经过审查的字体、构建 Host 和 Client bundle、执行类型检查，并运行软件包契约与安全测试。随后，`pnpm run audit:pack` 会根据明确的文件白名单检查 npm tarball，验证打包字体和内嵌字体的哈希，并拒绝导入素材、缓存、压缩包、未经审查的字体/音频、源映射、异常 tar 条目类型和过大的内嵌二进制文件。打包后的客户端 bundle 大小预算为 900 KB。

## 许可证与商标

插件源代码和原创生成素材采用 MIT 许可证。Fusion Pixel Font 采用 SIL Open Font License 1.1；详见 `assets/fonts/OFL.txt` 和 `THIRD_PARTY_NOTICES.md`。Minecraft 是 Microsoft Corporation 的商标。本项目为非官方项目，与 Mojang 或 Microsoft 无关联，亦未获得其批准或赞助。用户有责任遵守 Minecraft EULA 以及其所导入资源包的许可证。
