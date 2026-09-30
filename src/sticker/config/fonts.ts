/** 拉丁字符专用字体族名 */
export const LATIN_FONT_FAMILY = 'Inter Latin Bold'
/** Node 本地拉丁字体来源；网页优先使用 Inter 官方 CSS */
export const LATIN_FONT_PACKAGE_PATH = 'inter-ui/web-latin/Inter-Bold-subset.woff2'
/** 拉丁字符字体特性设置 */
export const LATIN_FONT_FEATURE_SETTINGS = '"ss01" 1, "ss04" 1'

/** Emoji 与符号字体候选描述 */
export const EMOJI_SYMBOL_FONT_DESCRIPTORS = [
  {
    key: 'appleColorEmoji',
    family: 'Apple Color Emoji',
    bundledFile: 'AppleColorEmoji.ttf',
  },
  {
    key: 'appleSymbols',
    family: 'Apple Symbols',
    bundledFile: 'AppleSymbols.ttf',
  },
  {
    key: 'segoeUiEmoji',
    family: 'Segoe UI Emoji',
    systemFile: 'C:/Windows/Fonts/seguiemj.ttf',
  },
  {
    key: 'segoeUiSymbol',
    family: 'Segoe UI Symbol',
    systemFile: 'C:/Windows/Fonts/seguisym.ttf',
  },
  {
    key: 'notoColorEmoji',
    family: 'Noto Color Emoji',
    bundledFile: 'NotoColorEmoji.ttf',
  },
  {
    key: 'notoSansSymbols2',
    family: 'Noto Sans Symbols 2',
    bundledFile: 'NotoSansSymbols2-Regular.ttf',
  },
] as const

/** 文本文字 fallback 字体族 */
export const TEXT_FONT_FAMILIES = [
  LATIN_FONT_FAMILY,
  'PingFang SC',
  'Noto Sans SC',
  'Microsoft YaHei',
] as const

export type EmojiSymbolFontKey =
  typeof EMOJI_SYMBOL_FONT_DESCRIPTORS[number]['key']

/** Emoji 与符号 fallback 字体族 */
export const EMOJI_SYMBOL_FONT_FAMILIES =
  EMOJI_SYMBOL_FONT_DESCRIPTORS.map(({ family }) => family)

/** Canvas 绘制时使用的完整字体族 fallback 链 */
export const CANVAS_FONT_FAMILIES = [
  ...TEXT_FONT_FAMILIES,
  ...EMOJI_SYMBOL_FONT_FAMILIES,
  'sans-serif',
] as const
