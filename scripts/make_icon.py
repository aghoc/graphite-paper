"""docs/assets/logo.png → app-icon.png (macOS 아이콘 격자: 1024 캔버스, 824 본체, 둥근 모서리, 투명 여백)"""
from PIL import Image, ImageDraw, ImageFilter

SRC, OUT = "docs/assets/logo.png", "app-icon.png"
CANVAS, BODY, RADIUS, SS = 1024, 824, 185, 4  # SS: 모서리 안티에일리어싱용 확대 배율

logo = Image.open(SRC).convert("RGBA").resize((BODY, BODY), Image.LANCZOS)
mask = Image.new("L", (BODY * SS, BODY * SS), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, BODY * SS - 1, BODY * SS - 1), RADIUS * SS, fill=255)
logo.putalpha(mask.resize((BODY, BODY), Image.LANCZOS))

icon = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
off = (CANVAS - BODY) // 2
# macOS 기본 아이콘처럼 아래쪽에 옅은 그림자
shadow = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
shadow.paste((0, 0, 0, 70), (off, off + 12), logo.split()[3])
icon = Image.alpha_composite(icon, shadow.filter(ImageFilter.GaussianBlur(14)))
icon.alpha_composite(logo, (off, off))
icon.save(OUT)
print("saved", OUT)
