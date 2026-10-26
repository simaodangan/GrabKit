"""Generate shared UI/window/menu tool icons from tool.json (requires Pillow)."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
palette = {"blue": ("#eaf1fc", "#6494d7"), "orange": ("#fbf1e6", "#ce9a61"),
           "purple": ("#f0ecfc", "#8b75cc")}
font_path = Path("C:/Windows/Fonts/seguisym.ttf")
names = sys.argv[1:] or [folder.name for folder in sorted((root / "tools").iterdir())
                        if folder.is_dir() and (folder / "tool.json").is_file()]
for name in names:
    folder = root / "tools" / name
    metadata = json.loads((folder / "tool.json").read_text(encoding="utf-8"))
    background, foreground = palette[metadata["color"]]
    image = Image.new("RGBA", (768, 768))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, 767, 767), radius=208, fill=background)
    font = ImageFont.truetype(str(font_path), 440)
    draw.text((384, 384), metadata["icon"], font=font, fill=foreground, anchor="mm")
    image = image.resize((256, 256), Image.Resampling.LANCZOS)
    image.save(folder / "icon.png")
    image.save(folder / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    print(f"Generated {name} icons")
