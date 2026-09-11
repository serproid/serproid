from PIL import Image
from collections import deque
from pathlib import Path

src = Path('/home/ubuntu/serproid/public/serproid-share.jpg')
out = Path('/home/ubuntu/serproid/public/serproid-favicon.png')
image = Image.open(src).convert('RGBA')
pixels = image.load()
width, height = image.size
visited = bytearray(width * height)
queue = deque()
for x in range(width):
    queue.append((x, 0)); queue.append((x, height - 1))
for y in range(height):
    queue.append((0, y)); queue.append((width - 1, y))

def is_background(r, g, b):
    # The supplied image has a warm near-white background; keep the dark logo intact.
    return r > 205 and g > 190 and b > 170 and max(r, g, b) - min(r, g, b) < 70

while queue:
    x, y = queue.popleft()
    index = y * width + x
    if visited[index]:
        continue
    visited[index] = 1
    r, g, b, _ = pixels[x, y]
    if not is_background(r, g, b):
        continue
    pixels[x, y] = (r, g, b, 0)
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < width and 0 <= ny < height:
            queue.append((nx, ny))

image.save(out, 'PNG', optimize=True)
print(out)
