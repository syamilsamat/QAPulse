import os

qa_pulse_pages_dir = r"c:\Users\raimi.rosman\QAPulse\artifacts\qa-pulse\src"

def patch_file(rel_path, patches):
    path = os.path.join(qa_pulse_pages_dir, rel_path)
    if not os.path.exists(path): return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    orig = content
    for p in patches:
        content = content.replace(p[0], p[1])
            
    if orig != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

# Layout.tsx
patch_file("components/Layout.tsx", [
    ("const Icon = item.icon;", "const Icon = item.icon as any;"),
    ("const SubIcon = sub.icon;", "const SubIcon = sub.icon as any;")
])

# NotificationDropdown.tsx
patch_file("components/NotificationDropdown.tsx", [
    ("const Icon = cfg.icon;", "const Icon = cfg.icon as any;")
])

# Inbox.tsx
patch_file("pages/Inbox.tsx", [
    ("const Icon = cfg.icon;", "const Icon = cfg.icon as any;")
])
