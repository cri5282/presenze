"""Genera le icone PWA partendo da un'unica grafica vettoriale-like.

Uso: python3 scripts/generate_icons.py
Richiede Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
S = 1024


def lerp(start: tuple[int, int, int], end: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(start[i] + (end[i] - start[i]) * t) for i in range(3))  # type: ignore[return-value]


def gradient(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size))
    draw = ImageDraw.Draw(image)
    start, end = (139, 124, 255), (34, 211, 238)
    for i in range(2 * size):
        draw.line([(i, 0), (0, i)], fill=lerp(start, end, i / (2 * size - 1)))
    return image.convert("RGBA")


def draw_mark() -> Image.Image:
    image = gradient(S)
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    # riflesso morbido in alto a sinistra
    draw.ellipse((-S * 0.28, -S * 0.42, S * 0.62, S * 0.46), fill=(255, 255, 255, 24))

    stroke = 54
    white = (255, 255, 255, 255)
    draw.rounded_rectangle((215, 312, 809, 824), radius=112, outline=white, width=stroke)
    draw.line((216, 488, 808, 488), fill=white, width=stroke)
    draw.line((368, 232, 368, 360), fill=white, width=stroke)
    draw.line((656, 232, 656, 360), fill=white, width=stroke)

    check = [(376, 650), (458, 735), (652, 545)]
    draw.line(check, fill=white, width=70, joint="curve")
    for x, y in (check[0], check[-1]):
        draw.ellipse((x - 35, y - 35, x + 35, y + 35), fill=white)

    image.alpha_composite(layer)
    return image


def rounded(image: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, S - 1, S - 1), radius=int(S * radius_ratio), fill=255
    )
    result = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    result.paste(image, (0, 0), mask)
    return result


def save(image: Image.Image, name: str, size: int) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    image.resize((size, size), Image.LANCZOS).save(OUT / name, "PNG", optimize=True)
    print(f"creata {name} ({size}x{size})")


def main() -> None:
    mark = draw_mark()
    save(rounded(mark), "icon-512.png", 512)
    save(rounded(mark), "icon-192.png", 192)
    save(mark, "icon-maskable-512.png", 512)
    save(mark, "apple-touch-icon.png", 180)


if __name__ == "__main__":
    main()
