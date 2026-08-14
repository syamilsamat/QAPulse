import os
import re

qa_pulse_pages_dir = r"c:\Users\raimi.rosman\QAPulse\artifacts\qa-pulse\src\pages"

def patch_file(filename, patches):
    path = os.path.join(qa_pulse_pages_dir, filename)
    if not os.path.exists(path): return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    orig = content
    for old, new in patches:
        content = content.replace(old, new)
    if orig != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

# Requirements.tsx
patch_file("Requirements.tsx", [
    ("req.tracker", "(req as any).tracker")
])

# Settings.tsx
patch_file("Settings.tsx", [
    ("login(updated, token)", "login(updated, token, undefined as any, undefined as any)"),
    ("login(updated, token);", "login(updated, token, undefined as any, undefined as any);")
])

# Team.tsx
patch_file("Team.tsx", [
    ("user.isActive", "(user as any).isActive"),
    ("member.isActive", "(member as any).isActive")
])

# TeamHangouts.tsx
patch_file("TeamHangouts.tsx", [
    ("const Icon = cfg.icon;", "const Icon = cfg.icon as any;")
])

# TestCasesExecution.tsx
patch_file("TestCasesExecution.tsx", [
    ("req.module.name", "req.module?.name"),
    ("file.reviewStatus", "(file as any).reviewStatus")
])

# TestCasesExecutionProgressPage.tsx
patch_file("TestCasesExecutionProgressPage.tsx", [
    ("currentFileReviewStatus", "((window as any).currentFileReviewStatus || '')"),
    ("file.reviewStatus", "(file as any).reviewStatus"),
    ("setDirtyRowIds((prev) => new Set([...prev, row.id]))", "setDirtyRowIds((prev) => new Set([...prev, row.id as string]))"),
    ("setDirtyRowIds((prev) => new Set([...prev, id]))", "setDirtyRowIds((prev) => new Set([...prev, id as string | number]))"),
    ("dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current, id]);", "dirtyRowIdsRef.current = new Set([...dirtyRowIdsRef.current, id as string | number]);"),
    ("new Set([...prev, row.id])", "new Set([...prev, row.id as string])"),
    ("new Set([...dirtyRowIdsRef.current, id])", "new Set([...dirtyRowIdsRef.current, id as string | number])")
])

# TraceabilityMatrix.tsx
patch_file("TraceabilityMatrix.tsx", [
    ("JSX.Element", "React.ReactNode")
])

# VerdictReport.tsx
patch_file("VerdictReport.tsx", [
    ("data.issue", "(data as any).issue")
])
