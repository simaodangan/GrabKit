"""Generate native icons from the app's simple SVG paths (requires Pillow)."""
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'shared'
svg = ET.parse(root / 'app-icon.svg').getroot()
scale = 32
image = Image.new('RGBA', (32 * scale, 32 * scale))
draw = ImageDraw.Draw(image)
namespace = {'svg': 'http://www.w3.org/2000/svg'}
rect = svg.find('svg:rect', namespace)
draw.rounded_rectangle((0, 0, image.width - 1, image.height - 1), radius=float(rect.attrib['rx']) * scale, fill=rect.attrib['fill'])
group = svg.find('svg:g', namespace)
width = float(group.attrib['stroke-width']) * scale
color = group.attrib['stroke']
for element in group:
    tokens = re.findall(r'[A-Za-z]|-?\d+(?:\.\d+)?', element.attrib['d'])
    position = (0, 0)
    points = []
    def paint():
        if len(points) < 2:
            return
        scaled = [(x * scale, y * scale) for x, y in points]
        draw.line(scaled, fill=color, width=round(width), joint='curve')
        for x, y in scaled:
            radius = width / 2
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    index = 0
    while index < len(tokens):
        command = tokens[index]
        index += 1
        if command == 'M':
            paint()
            position = (float(tokens[index]), float(tokens[index + 1]))
            index += 2
            points = [position]
        elif command in 'hHvV':
            value = float(tokens[index])
            index += 1
            x, y = position
            position = {'h': (x + value, y), 'H': (value, y), 'v': (x, y + value), 'V': (x, value)}[command]
            points.append(position)
        elif command in 'zZ':
            points.append(points[0])
            position = points[0]
        else:
            raise ValueError(f'Unsupported SVG command: {command}')
    paint()
image = image.resize((256, 256), Image.Resampling.LANCZOS)
image.save(root / 'app-icon.png')
image.save(root / 'app-icon.ico', sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print('Generated PNG and ICO from app-icon.svg')
