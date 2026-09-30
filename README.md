# 高峰生成器

输入文案，生成带渐变、描边和错位攀登效果的中文贴纸，也能制作飞书群头像。

**[在线使用](https://zhousiru.github.io/scale-new-heights-generator)** · [更新日志](CHANGELOG.md) · [技术实现与 Node API](https://github.com/zhousiru/scale-new-heights-generator/blob/main/docs/technical-implementation.md)

## 能做什么

- 「勇攀高峰」与「字节范」两种样式，内置 27 个分组预设。
- 自定义文案、多行排版、渐变颜色、描边和倾斜，支持 Iconify 前缀图标。
- 生成飞书群头像，支持彩底白字、白底彩环同色字和文字旋转。
- 复制图片、下载 PNG、分享当前效果；开启 HDR 高亮后导出 Ultra HDR JPEG。
- 浏览器优先加载在线字体，失败时使用本地字体；Node 可直接在本地生成图片。

发送到聊天后，可右键「添加为表情」，保留贴纸的尺寸和形态。

## 本地开发

需要 Node 24+ 和 pnpm。

```bash
pnpm install
pnpm dev
```

`pnpm build` 构建网页和 npm 包；`pnpm test`、`pnpm lint` 检查代码。

## 在 Node 中使用

npm 包名为 `@syru/byted-sticker-generator`，需要 Node 24+。

```bash
npm install @syru/byted-sticker-generator@^1.0.0
```

```ts
import { renderStickerToBuffer } from '@syru/byted-sticker-generator/node'

const png = await renderStickerToBuffer({
  text: '高峰不常有',
  envelope: { colors: ['#1688ff', '#44b305'], gradientAngle: 45 },
  icon: '',
})

// png 是 Buffer，可直接交给文件保存或机器人图片上传逻辑。
```

头像使用 `@syru/byted-sticker-generator/avatar/node`。更多 API、离线使用和自定义 Canvas runtime 见 [技术实现文档](https://github.com/zhousiru/scale-new-heights-generator/blob/main/docs/technical-implementation.md)。

## 说明

预设图标来自 [Iconify](https://iconify.design/)。贴纸字体使用抖音美好体、优设标题黑和 Inter；字体来源与加载方式见技术实现文档。

内置预设文案仅供效果演示，与相关企业无官方关联。
