#!/usr/bin/env python3
import sys, io, argparse, urllib.request, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Busca la carpeta fonts subiendo un nivel desde donde está el script
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONTS_DIR = os.path.join(BASE_DIR, '..', 'fonts')

def get_font_path(filename, fallback):
    local_path = os.path.join(FONTS_DIR, filename)
    return local_path if os.path.exists(local_path) else fallback

FONT_BOLD = get_font_path('DejaVuSans-Bold.ttf', 'arialbd.ttf')
FONT_REG  = get_font_path('DejaVuSans.ttf', 'arial.ttf')
FONT_JP   = get_font_path('NotoSansJP-Black.ttf', 'msgothic.ttc')

def F(path, size):
    return ImageFont.truetype(path, size)

def load_avatar(url):
    if not url or url == 'none': return None
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=8) as r:
            return Image.open(io.BytesIO(r.read())).convert('RGBA')
    except: return None

def draw_styled_text(draw, canvas, pos, text, font, fill, glow=False):
    """Dibuja texto con un efecto de resplandor (glow) y sombra."""
    # 1. Capa de resplandor (Glow)
    if glow:
        glow_img = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_img)
        # Usamos el color de la letra pero con menos opacidad para el aura
        glow_color = (*fill[:3], 150) if len(fill) > 3 else (*fill, 150)
        glow_draw.text(pos, text, font=font, fill=glow_color)
        # Desenfoque fuerte para crear el aura de brillo
        glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=7))
        canvas.paste(glow_img, (0, 0), glow_img)

    # 2. Capa de sombra negra (Contraste)
    shadow_img = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_img)
    shadow_draw.text((pos[0] + 2, pos[1] + 2), text, font=font, fill=(0, 0, 0, 220))
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(radius=2))
    canvas.paste(shadow_img, (0, 0), shadow_img)

    # 3. Texto principal
    draw.text(pos, text, font=font, fill=fill)

def generate(bg_path, avatar_url, role_name, passed, score, max_score, username, out_path):
    W, H = 1280, 720
    accent = (140, 255, 240) if passed else (255, 100, 100)

    # 1. FONDO
    bg = Image.open(bg_path).convert('RGBA')
    bg_ratio, target_ratio = bg.width / bg.height, W / H
    if bg_ratio > target_ratio:
        new_w = int(target_ratio * bg.height)
        bg = bg.crop(((bg.width - new_w) // 2, 0, (bg.width + new_w) // 2, bg.height))
    else:
        new_h = int(bg.width / target_ratio)
        bg = bg.crop((0, (bg.height - new_h) // 2, bg.width, (bg.height + new_h) // 2))
    bg = bg.resize((W, H), Image.LANCZOS)
    
    # Mantenemos el fondo oscuro (160) para que el brillo destaque
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 160)) 
    canvas = Image.alpha_composite(bg, overlay)
    draw = ImageDraw.Draw(canvas)

    # 2. HEADER
    av = load_avatar(avatar_url)
    if av:
        av = av.resize((85, 85), Image.LANCZOS)
        canvas.paste(av, (50, 50), av if av.mode == 'RGBA' else None)
    
    draw_styled_text(draw, canvas, (150, 50), username, F(FONT_BOLD, 28), (255, 255, 255))
    draw_styled_text(draw, canvas, (150, 85), f"Current level: {role_name}", F(FONT_JP, 18), accent, glow=True)

    # 3. CENTRO
    f_rol = F(FONT_JP, 70)
    tw = draw.textlength(role_name, font=f_rol)
    draw_styled_text(draw, canvas, ((W - tw) // 2, H // 2 - 110), role_name, f_rol, (255, 255, 255))

    kanji = "合格" if passed else "失敗"
    f_k = F(FONT_JP, 165)
    kw = draw.textlength(kanji, font=f_k)
    # Brillo intenso para el Kanji principal
    draw_styled_text(draw, canvas, ((W - kw) // 2, H // 2), kanji, f_k, accent, glow=True)

    # 4. FOOTER
    footer_txt = f"Score: {score} | Max Score: {max_score}"
    fw = draw.textlength(footer_txt, font=F(FONT_REG, 22))
    draw_styled_text(draw, canvas, ((W - fw) // 2, H - 75), footer_txt, F(FONT_REG, 22), (255, 255, 255, 180))

    canvas.convert('RGB').save(out_path, 'PNG')
    print(f"Success: {out_path}")

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('bg_path'); p.add_argument('avatar_url'); p.add_argument('role_name')
    p.add_argument('passed'); p.add_argument('score', type=int)
    p.add_argument('max_score', type=int); p.add_argument('username'); p.add_argument('output_path')
    a = p.parse_args()
    generate(a.bg_path, a.avatar_url, a.role_name, a.passed.lower()=='true', a.score, a.max_score, a.username, a.output_path)