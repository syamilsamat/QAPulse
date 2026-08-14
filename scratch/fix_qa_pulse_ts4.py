import os
import re

qa_pulse_pages_dir = r"c:\Users\raimi.rosman\QAPulse\artifacts\qa-pulse\src"

def patch_file(rel_path, patches):
    path = os.path.join(qa_pulse_pages_dir, rel_path)
    if not os.path.exists(path): return
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    orig = content
    for p in patches:
        if len(p) == 2:
            content = content.replace(p[0], p[1])
        elif len(p) == 3:
            content = re.sub(p[0], p[1], content)
            
    if orig != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

# AdminSearch.tsx
patch_file("pages/AdminSearch.tsx", [
    ("const handleSuccess = (queryKey: string[], message: string)", "const handleSuccess = (queryKey: readonly any[], message: string)")
])

# Layout.tsx
patch_file("components/Layout.tsx", [
    ("isPipelineFlow: true,", "// @ts-ignore\nisPipelineFlow: true,"),
    (" as never", " as any")
])

# NotificationDropdown.tsx
patch_file("components/NotificationDropdown.tsx", [
    (" as never", " as any")
])

# Inbox.tsx
patch_file("pages/Inbox.tsx", [
    (" as never", " as any")
])

# ModuleAndProject.tsx
patch_file("pages/ModuleAndProject.tsx", [
    ("user.redmineApiKey", "(user as any).redmineApiKey"),
    ("user?.redmineApiKey", "(user as any)?.redmineApiKey")
])

# RequirementDetail.tsx
patch_file("pages/RequirementDetail.tsx", [
    ("const headers = token ?", "const headers: Record<string, string> = token ?")
])

# Requirements.tsx
patch_file("pages/Requirements.tsx", [
    ("req.parentId", "(req as any).parentId"),
    ("req?.parentId", "(req as any)?.parentId")
])

# Team.tsx
patch_file("pages/Team.tsx", [
    ("u.isActive", "(u as any).isActive"),
    ("editingUser.isActive", "(editingUser as any).isActive"),
    ("updated.isActive", "(updated as any).isActive")
])

# TestCasesExecution.tsx
patch_file("pages/TestCasesExecution.tsx", [
    ("req.module.toLowerCase()", "req.module?.toLowerCase()"),
    ("f.reviewStatus", "(f as any).reviewStatus")
])

# TestCasesExecutionProgressPage.tsx
patch_file("pages/TestCasesExecutionProgressPage.tsx", [
    ("file?.reviewStatus", "(file as any)?.reviewStatus"),
    ("file.reviewStatus", "(file as any).reviewStatus")
])
