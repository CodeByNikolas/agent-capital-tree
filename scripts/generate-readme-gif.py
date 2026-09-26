"""Encode actual Kanoki preview captures. Run capture-kanoki-demo.mjs first."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1]
names = ("overview", "tree", "applications", "activity")
frames = [Image.open(root / "artifacts/ui/kanoki-demo" / f"{name}.png").convert("RGB") for name in names]
assert all(frame.size == (1280, 720) for frame in frames)
output = root / "assets/agent-capital-tree-flow.gif"
frames[0].save(output, save_all=True, append_images=frames[1:], duration=3000, loop=0, optimize=False)
with Image.open(output) as gif:
    assert gif.n_frames == 4 and gif.size == (1280, 720)
    for index in range(gif.n_frames):
        gif.seek(index)
        gif.load()
print(f"{output.name}: 4 frames, 1280x720, {output.stat().st_size} bytes")
