# 技术实现

本文面向维护者和接入 npm 包的开发者。产品功能和开发启动方式见 [README](../README.md)。

## 入口与模块边界

浏览器应用使用 React、TanStack Router 和 Radix UI；贴纸与头像有各自的配置、状态、布局和渲染管线。`src/shared` 只放共享控件、预览、Canvas runtime 和 Worker 通信。UI 依赖属于开发依赖，安装 npm 包不会额外安装网页控件。

npm 导出六个入口：

| 入口 | 用途 |
| --- | --- |
| `@syru/byted-sticker-generator` | 贴纸预设、配置、URL 编解码和配色工具 |
| `/core` | 可注入 Canvas runtime 的贴纸渲染核心 |
| `/node` | 默认 Node runtime、贴纸 PNG / HDR API |
| `/avatar` | 头像配置、URL 编解码与渲染核心 |
| `/avatar/core` | 可注入 runtime 的头像渲染核心 |
| `/avatar/node` | Node 头像 API |

Node 入口不依赖 DOM、React 或浏览器；默认 runtime 在首次渲染时动态加载可选依赖 `@napi-rs/canvas`。Node 最低版本为 24，与 HDR 编码依赖保持一致。

## 贴纸渲染

[`sticker.ts`](../src/sticker/render/sticker.ts) 负责测量、排版、字形整形、蒙版膨胀、渐变填充和裁剪。相关步骤拆在同目录的 `layout`、`glyphs`、`mask` 和 `gradient` 模块中。浏览器在 Worker 的 `OffscreenCanvas` 上执行，Node 复用同一核心。

形状蒙版与前景蒙版分开：文字和图标参与外轮廓，彩色 Emoji 与多色图标最后叠加原生颜色。单色图标随贴纸重新着色。文字阴影按字形蒙版合成到包体内，在务实浪漫系列中保留字面投在描边上的层次。

渐变端点按可见蒙版在渐变方向上的投影范围计算，让端点颜色覆盖实际形状。预设下拉采用对应系列字体，用 Canvas 的实际字面包围盒设置 CSS 渐变范围；优设标题黑文字放大 1.25 倍，行间距维持原值。

SVG 图标通过 Iconify 加载；浏览器主线程把 SVG 栅格化为 `ImageBitmap` 再转移到 Worker。预设的 `iconTilt` 是逐个比较直立与倾斜形状后选定的配置。

## 配色与校准

[`colorSpace.ts`](../src/sticker/utils/colorSpace.ts) 只从 `culori/fn` 导入所需的 HEX / RGB / HSL 解析、转换和序列化函数。没有注册整套色彩空间或引入命名颜色表，`colord` 已移除。无效输入回退黑色；支持带透明度的 HEX、RGB 和 HSL。

勇攀高峰直接使用输入渐变。单色输入用同色相的深浅配套色补成双色。字节范的输入表示字面与描边的感知中间色；[`color.ts`](../src/sticker/utils/color.ts) 用同一套 Oklab 模型向两侧分离明度和色度，分别生成字面和描边渐变。邻近停靠点参与计算，无需给每个预设硬编码两套颜色。

模型特征为 `[1, L, a, b, 邻色ΔL, 邻色Δa, 邻色Δb]`。测量数据放在 [`byte-style-palettes.json`](../scripts/fixtures/byte-style-palettes.json)，仅保存 RGB 色值，不打包原始参考图。脚本使用带正则化的最小二乘拟合，生成 [`byteStyleCalibration.ts`](../src/sticker/config/byteStyleCalibration.ts)。明度分离限制、近灰色处理和色域映射也有具名参数及注释。

超出 sRGB 色域时，在固定明度和色相下二分缩减色度，避免逐通道裁切改变颜色关系。明度分离限制帮助维持字面与轮廓差异，但不等于对任意输入保证可访问性对比度。

```bash
pnpm calibrate:colors                 # 检查测量数据能否重现现有系数；CI 也执行
node scripts/calibrate-byte-style.mjs # 测量数据改变后重新生成系数
```

## 字体加载

| 字体 | 浏览器优先来源 | 本地来源 |
| --- | --- | --- |
| 抖音美好体 | [字节字体 CSS](https://fonts.bytedance.com/dfd/api/v1/css?family=DOUYINSANSBOLD-GB&display=swap) | `public/DouyinSansBold.woff2` |
| 优设标题黑 | [在线分片 CSS](https://cn-font.claude-code-best.win/packages/ysbth/dist/优设标题黑/result.css) | `public/YouSheBiaoTiHei.ttf` |
| Inter | [官方 CSS](https://rsms.me/inter/inter.css) | `inter-ui/web-latin/Inter-Bold-subset.woff2` |

[`fontStylesheet.ts`](../src/sticker/worker/fontStylesheet.ts) 用原生 CSSOM 读取 `@font-face` 声明，解析相对 URL，再把字体来源传给 Worker。特色字体的 CSS 链接读取后移除，避免浏览器先自动下载一整套字库；Inter CSS 保留供页面使用。

Worker 和预设下拉按当前文字选择 `unicode-range` 分片。重叠区间遵循后声明优先，避免把相同字符所在的所有分片都下载。字体 CSS 与字库请求分别最多等待 5 秒；任一步失败或特色字体缺少当前字符时，移除已注册的远程字体并回退本地整库。同一页面会话内保持本地回退，重新打开页面后重试 CDN。超时后迟到的远程字体不会覆盖本地字体。

Worker 的 Canvas 可能保留同名字体的旧分片匹配结果，导致切换预设后新字符使用系统字体。每次新增已加载分片时，使用包含分片数量的字体族名，并按 CSS 声明顺序重新注册已加载分片，让测量与绘制重新匹配。没有新增分片时保持族名与注册结果，族名数量受分片总数限制；预设菜单读取同一个当前族名。

Node 始终从本地注册字体，不读取 CDN。Inter 本地子集来自已有 `inter-ui` 依赖，不在 `public` 中复制文件；没有增加新的静态字库或参考图片。

字体选择按 grapheme 执行：优设标题黑承载中英文数字；抖音美好体在中文占多数时承载少量英文数字，其余西文交给 Inter。Emoji 与符号使用运行环境提供的字体。不同操作系统的 Emoji 与字体栅格化可能产生差异。

## 尺寸、内存与任务调度

[`outputSize.ts`](../src/sticker/render/outputSize.ts) 在 1x 导出时以固定 72px em 排版。成品随文字增长，超过默认最长边 3072px 或内容像素预算 `512²` 后整体缩小，不重新换行。透明留白另外添加，默认左右 4px、上下 8px。`outputScale` 同比增加字号和预算；内部抗锯齿倍率不改变成品字号。

[`rasterScale.ts`](../src/sticker/render/rasterScale.ts) 根据最终输出选择内部栅格比例。400 万像素以内保留原始栅格；更大的画布以每个输出像素 `2 × antialiasScale` 个采样为目标，并限制单张中间画布最多约 1600 万像素、单边 16380px。该限制不是进程总内存上限。降采样可能改变边缘像素和裁剪取整。

裁剪、缩放和 padding 合成一步完成，复用蒙版与绘制缓冲。Worker 串行执行：待处理预览只保留最新请求，正在运行的预览完成后丢弃过期结果；导出优先且不被预览取消。每个工具只缓存最近一次渲染及编码结果，相同参数的复制和导出可直接复用。

[`imageWorker.ts`](../src/shared/worker/imageWorker.ts) 只负责客户端请求和调度；[`imageWorkerResult.ts`](../src/shared/worker/imageWorkerResult.ts) 负责 Worker 端编码与返回。HDR 编码器仅在开启 HDR 时动态导入，普通 PNG 不加载它。

## 头像、HDR 与分享

头像使用独立的 [`avatar.ts`](../src/avatar/render/avatar.ts) 管线，执行贴边圆形、渐变样式、多行自适应和旋转。`fill` 为渐变背景白字，`outline` 为白底彩环同色字。

HDR 输出将最终画布转成线性 HDR 浮点图，通过 `hdrify` 编码 Ultra HDR JPEG gain map；强度以 EV 表示，`maxContentBoost = 2^EV`。PNG 保留透明通道，HDR JPEG 合成白底。HDR 预览使用 Blob 图片，避免画回普通 Canvas 丢失高亮信息。

控件状态用短键 query 编码，只序列化非默认值。`m=simple` 展示生成图与返回编辑按钮，适合 iframe；受限嵌入场景提供新标签页导出入口。

## Node API 与部署


面向机器人服务端使用 `@syru/byted-sticker-generator/node` 子入口。它不依赖 React、DOM、Web Worker 或 Chromium；默认会在真正渲染时动态加载可选依赖 `@napi-rs/canvas`。如果部署环境不想安装 native 依赖，可以通过 `new StickerGenerator(runtime)` 注入自己的 canvas runtime。

```ts
import { renderStickerToBuffer } from '@syru/byted-sticker-generator/node'

const png = await renderStickerToBuffer({
  text: '高峰不常有',
  envelope: {
    colors: ['#1688ff', '#44b305'],
    gradientAngle: 45,
  },
  icon: '',
}, {
  outputScale: 2,
})

// 飞书机器人可以直接把 png 传给现有图片上传逻辑：
// const imageKey = await uploadImage(bot, png, 'sticker.png')
// await sendImageToChat(bot, chatId, imageKey)
```

Web 高级设置与 Node 渲染都支持 1-5x 内部超采样抗锯齿，默认 1.5x，用来压掉斜线和斜切边缘的阶梯锯齿。极限性能或排障场景可临时关闭：

```ts
await renderStickerToBuffer('高峰不常有', {
  antialiasScale: 1,
})
```

如果运行环境禁止出网，可关闭 Iconify 图标拉取：

```ts
const png = await renderStickerToBuffer('高峰不常有', { loadIcon: false })
```

自定义 runtime 时，不需要安装 `@napi-rs/canvas`。runtime 至少需要提供 `createCanvas` 和 `toPngBytes`；如果要自动注册字体或加载前缀图标，再补 `registerFont` / `hasFont` / `loadImage`：

```ts
import { StickerGenerator, type StickerGeneratorRuntime } from '@syru/byted-sticker-generator/node'

const runtime: StickerGeneratorRuntime = {
  createCanvas: (width, height) => myCanvasFactory(width, height),
  toPngBytes: async (canvas) => await encodePng(canvas),
}

const generator = new StickerGenerator(runtime)
const png = await generator.renderBuffer('高峰不常有', { loadIcon: false })
```

包内会默认注册 `public/DouyinSansBold.woff2` 与 `public/YouSheBiaoTiHei.ttf`。如果部署系统把字体复制到了其他目录，可以显式传入：

```ts
await renderStickerToBuffer('高峰不常有', {
  fontFiles: {
    snh: '/opt/fonts/DouyinSansBold.woff2',
    bs: '/opt/fonts/YouSheBiaoTiHei.ttf',
    inter: '/opt/fonts/Inter-Bold-subset.woff2',
  },
})
```

Inter Latin Bold 默认从 `inter-ui/web-latin/Inter-Bold-subset.woff2` 解析，注册为独立字体族 `Inter Latin Bold`；缺失时会退回系统 sans-serif。Emoji / Symbol fallback 字体会按运行环境可用性注册：macOS 优先 Apple Color Emoji / Apple Symbols，Windows 走 Segoe UI Emoji / Segoe UI Symbol，Linux 或容器环境可使用系统安装或显式传入的 Noto 字体。

根入口只导出配置、预设、URL 编解码和配色工具等纯逻辑：

```ts
import { DEFAULT_STICKER_CONTROLS, STICKER_PRESET_LIST } from '@syru/byted-sticker-generator'
```

`core` 子入口导出不绑定 Node 的渲染核心，适合在 Web 或自定义 Canvas runtime 中复用：

```ts
import { renderSticker, setCanvasRuntime } from '@syru/byted-sticker-generator/core'
```

飞书头像使用独立入口，不依赖 sticker 的字形/描边管线：

```ts
import { renderAvatarToBuffer } from '@syru/byted-sticker-generator/avatar/node'

const png = await renderAvatarToBuffer({
  text: '前端群',
  style: 'sunset',
  mode: 'outline',
  size: 512,
  rotation: -8,
})
```


浏览器部署由 [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) 在推送 main 后发布 GitHub Pages，`VITE_BASE` 配置仓库路径。

## 验证与体积审计

```bash
pnpm lint
pnpm exec tsc -b
pnpm test
pnpm build
pnpm audit:size
pnpm benchmark
```

`audit:size` 在内存中构建，列出实际产物原始 / gzip 体积、公共资源和依赖贡献。依赖贡献采用最终压缩前的模块长度，只用于定位大头，不能直接相加当作下载体积。两个 Worker 分别构建 HDR 延迟模块，只有使用相应工具的 HDR 功能时才请求对应文件。

字体仍是主要静态资源：抖音美好体约 791 KiB，优设标题黑约 1.35 MiB，作为离线回退和 Node 字体保留。`@napi-rs/canvas` 的平台原生模块仅用于 Node，不进入网页构建。颜色库保留 Culori 按需导入，不为节省几 KiB 自写颜色转换。类名拼接使用项目所需的 `clsx`，移除了不适用的 Tailwind 合并规则。

性能脚本预热 3 次，再取 9 次中位数，包含 PNG 编码，不包含图标网络请求；输出 SHA-256 便于复现。可用 `BENCH_FILTER=long pnpm benchmark` 只测长文本。以下实测结果使用同一台机器、Node 24、相同本地字体，比较 beta.2 的默认行为与本次正式版默认行为。输出尺寸策略已变化，因此不代表同分辨率逐像素等价的优化。

| 输入 | beta.2 | 1.0.0 工作分支 |
| --- | ---: | ---: |
| 300 字、15 行 | 2.45 s | 0.20 s |
| 100 字、单行 | 1.72 s | 0.15 s |

测试环境：macOS arm64、Node 24.21.0、`@napi-rs/canvas` 1.0.2、默认 1.5x 抗锯齿、本地字体、关闭图标下载。基线为 `9ff6cd0`（beta.2）；每个样例独立渲染，未复用最近结果缓存。长文案速度来自成品尺寸和内部画布预算的共同调整。实际设备、输入及输出参数不同，耗时也会不同。
