"""Generate the illustrative README animation with Pillow."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "agent-capital-tree-flow.gif"
def font(size, bold=False):
    names = ["C:/Windows/Fonts/segoeuib.ttf", "DejaVuSans-Bold.ttf"] if bold else ["C:/Windows/Fonts/segoeui.ttf", "DejaVuSans.ttf"]
    for name in names:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()


BACKGROUND = "#0b1210"
PANEL = "#14211c"
PANEL_ACTIVE = "#20392d"
BORDER = "#3d5548"
MINT = "#9dd3ae"
WHITE = "#f0f5ef"
MUTED = "#a4b4a9"
YELLOW = "#f0d58b"


def card(draw, box, eyebrow, title, detail, active=False):
    x0, y0, x1, y1 = box
    draw.rounded_rectangle(box, radius=18, fill=PANEL_ACTIVE if active else PANEL, outline=MINT if active else BORDER, width=3 if active else 2)
    draw.text((x0 + 22, y0 + 20), eyebrow, font=font(16, True), fill=MINT if active else MUTED)
    draw.text((x0 + 22, y0 + 55), title, font=font(25, True), fill=WHITE)
    draw.text((x0 + 22, y0 + 99), detail, font=font(17), fill=MUTED)


def arrow(draw, start, end, active=False, reverse=False):
    color = MINT if active else BORDER
    width = 7 if active else 4
    draw.line((start, end), fill=color, width=width)
    tip = start if reverse else end
    sign = -1 if reverse else 1
    draw.polygon([(tip[0], tip[1]), (tip[0] - sign * 14, tip[1] - 9), (tip[0] - sign * 14, tip[1] + 9)], fill=color)


steps = [
    ("01 / AUTHORIZE", "Owner creates and funds the root vault.", 0),
    ("02 / DELEGATE", "Capital moves into a separate child vault.", 1),
    ("03 / CONSTRAIN", "ENS roles and ancestor policies narrow the mandate.", 2),
    ("04 / RECOVER", "The owner keeps an independent recovery path.", 3),
]


def frame(index):
    image = Image.new("RGB", (960, 520), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.text((36, 28), "agent capital", font=font(33, True), fill=WHITE)
    draw.text((241, 28), "tree", font=font(33, True), fill=MINT)
    draw.text((38, 78), "How delegated capital works  ·  illustrative flow  ·  Sepolia", font=font(17), fill=MUTED)
    draw.rounded_rectangle((36, 119, 924, 372), radius=22, fill="#101a16", outline="#273c30", width=2)

    owner = (62, 165, 296, 326)
    root = (363, 165, 597, 326)
    child = (664, 165, 898, 326)
    arrow(draw, (300, 245), (358, 245), active=index in (0, 3), reverse=index == 3)
    arrow(draw, (601, 245), (659, 245), active=index in (1, 2))
    card(draw, owner, "HUMAN OWNER", "Wallet", "Funds · recovers", active=index in (0, 3))
    card(draw, root, "ROOT AGENT", "Root vault", "Delegates capital", active=index in (0, 1))
    card(draw, child, "CHILD AGENT", "Child vault", "Bounded mandate", active=index in (1, 2))

    if index == 2:
        draw.rounded_rectangle((696, 292, 866, 316), radius=9, fill="#35482e")
        draw.text((712, 294), "PAY only · example", font=font(13, True), fill=YELLOW)

    label, description, _ = steps[index]
    draw.text((42, 397), label, font=font(15, True), fill=MINT)
    draw.text((42, 426), description, font=font(24, True), fill=WHITE)
    for dot in range(4):
        draw.ellipse((831 + dot * 25, 459, 841 + dot * 25, 469), fill=MINT if dot == index else BORDER)
    draw.text((42, 477), "Separate vaults  ·  narrower rights  ·  owner recovery", font=font(14), fill=MUTED)
    return image


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    frames = [frame(i) for i in range(len(steps))]
    frames[0].save(OUTPUT, save_all=True, append_images=frames[1:], duration=[1100, 1100, 1400, 1400], loop=0, optimize=True)
    print(OUTPUT)


if __name__ == "__main__":
    main()
