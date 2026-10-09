"""仅在更新随包字体后手动运行；安装、构建和运行时均不依赖 Python。

维护环境：pip install 'fonttools[woff]==4.60.2' 'brotli==1.2.0'
执行：python scripts/normalize-font-weight.py
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables.DefaultTable import DefaultTable


PUBLIC = Path(__file__).resolve().parent.parent / "public"

for filename in ("DouyinSansBold.woff2", "YouSheBiaoTiHei.ttf"):
    path = PUBLIC / filename
    with TTFont(path, recalcTimestamp=False) as font:
        metrics = font["OS/2"]
        header = font["head"]
        # 与 FONT_REGISTRY / 浏览器 FontFace 的 bold 声明一致；不修改字形。
        selection = (metrics.fsSelection | 0x20) & ~0x40
        style = header.macStyle | 1
        if (metrics.usWeightClass, metrics.fsSelection, header.macStyle) == (700, selection, style):
            print(f"{filename}: already bold")
            continue
        metrics.usWeightClass = 700
        metrics.fsSelection = selection
        header.macStyle = style
        patched_metrics = DefaultTable("OS/2")
        patched_metrics.data = metrics.compile(font)
        # 编译 OS/2 会加载 cmap/post；重新打开，避免连带重新序列化这些表。
        with TTFont(path, recalcTimestamp=False) as output:
            output["OS/2"] = patched_metrics
            output["head"].macStyle = style
            output.save(path, reorderTables=False)
        print(f"{filename}: normalized to bold (700)")
