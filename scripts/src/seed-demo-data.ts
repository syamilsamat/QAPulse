/**
 * Seeds a realistic, fully-linked client-demo dataset into QAPulse by
 * calling the real API (not raw SQL) — so validation, audit logging, defect
 * code generation, and notifications all fire exactly as they would for a
 * real user. Every created entity is recorded into demo-seed-manifest.json
 * as it's created, so clear-demo-data.ts can reverse this precisely.
 *
 * Run from the Replit shell:
 *   cd scripts
 *   QAPULSE_API_URL=https://your-repl-name.username.repl.co npx tsx src/seed-demo-data.ts
 *
 * See scripts/DEMO_DATA.md for full instructions.
 */

import {
  loginAdmin, login, api, saveManifest, loadManifest,
  type ManifestEntry,
} from "./seed-client";
import {
  DEMO_PASSWORD, USERS, TEAMS, PROJECTS, MILESTONES, MODULES,
  REQUIREMENTS, TEST_CASES, EXECUTION_FILES, DEFECTS, TASKS, RISKS,
  type DemoRequirement,
} from "./demo-data";

const manifest: ManifestEntry[] = loadManifest();
if (manifest.length > 0) {
  console.error(
    `demo-seed-manifest.json already has ${manifest.length} entries — refusing to seed on top of ` +
    `an existing demo dataset. Run "npx tsx src/clear-demo-data.ts" first.`,
  );
  process.exit(1);
}

function track(type: ManifestEntry["type"], id: number | string, label: string) {
  manifest.push({ type, id, label });
  saveManifest(manifest);
}

async function main() {
  console.log("Logging in as admin...");
  const adminToken = await loginAdmin();

  // ── 1. Modules (shared registry — not tracked/deleted; harmless to keep) ─
  console.log("\nEnsuring execution modules exist...");
  const existingModules = await api<{ id: number; name: string }[]>("/modules", adminToken);
  const existingModuleNames = new Set(existingModules.map((m) => m.name));
  const moduleIdByName = new Map<string, number>(existingModules.map((m) => [m.name, m.id]));
  for (const name of MODULES) {
    if (existingModuleNames.has(name)) continue;
    const created = await api<{ id: number; name: string }>("/modules", adminToken, { method: "POST", body: { name } });
    moduleIdByName.set(name, created.id);
    console.log(`  + module: ${name}`);
  }

  // ── 2. Users ──────────────────────────────────────────────────────────────
  console.log("\nCreating demo users...");
  const userIdByKey = new Map<string, number>();
  const tokenByKey = new Map<string, string>();
  for (const u of USERS) {
    const created = await api<{ id: number }>("/users", adminToken, {
      method: "POST",
      body: { name: u.name, email: u.email, password: DEMO_PASSWORD, role: u.role },
    });
    userIdByKey.set(u.key, created.id);
    track("user", created.id, `${u.name} (${u.role})`);
    // New users are forced to change password on first login — fine for a
    // real onboarding flow, but a demo login shouldn't hit that prompt.
    await api(`/users/${created.id}`, adminToken, { method: "PATCH", body: { mustChangePassword: false } });
    const token = await login(u.email, DEMO_PASSWORD);
    tokenByKey.set(u.key, token);
    console.log(`  + ${u.name} <${u.email}> — ${u.role}`);
  }

  // ── 3. Teams + members ────────────────────────────────────────────────────
  console.log("\nCreating teams...");
  const teamIdByKey = new Map<string, number>();
  for (const t of TEAMS) {
    const team = await api<{ id: number }>("/teams", adminToken, {
      method: "POST", body: { name: t.name, department: t.department },
    });
    teamIdByKey.set(t.key, team.id);
    track("team", team.id, t.name);
    for (const m of t.members) {
      await api(`/teams/${team.id}/members`, adminToken, {
        method: "POST", body: { userId: userIdByKey.get(m.userKey), role: m.role },
      });
    }
    console.log(`  + ${t.name} (${t.members.length} members)`);
  }

  // ── 4. Projects + team/member assignment ─────────────────────────────────
  console.log("\nCreating projects...");
  const projectIdByKey = new Map<string, number>();
  for (const p of PROJECTS) {
    const project = await api<{ id: number }>("/projects", adminToken, {
      method: "POST", body: { name: p.name, description: p.description, status: "active" },
    });
    projectIdByKey.set(p.key, project.id);
    track("project", project.id, p.name);

    const teamId = teamIdByKey.get(p.teamKey)!;
    await api(`/projects/${project.id}/teams`, adminToken, { method: "POST", body: { teamId } });

    // CR035 — project_teams no longer grants access on its own (it's kept
    // above purely for the Teams page's organizational display). Real
    // access comes from project_members, so every team member needs an
    // explicit grant here too, same as the cross-functional directMemberKeys
    // below — otherwise a fresh reseed leaves the QA team locked out of
    // their own demo projects until someone manually runs the migration
    // script afterward.
    const team = TEAMS.find((t) => t.key === p.teamKey)!;
    for (const member of team.members) {
      await api(`/projects/${project.id}/members`, adminToken, {
        method: "POST", body: { userId: userIdByKey.get(member.userKey) },
      });
    }

    for (const memberKey of p.directMemberKeys) {
      await api(`/projects/${project.id}/members`, adminToken, {
        method: "POST", body: { userId: userIdByKey.get(memberKey) },
      });
    }

    // CR035 — associate this project's modules so the Project Access panel's
    // module picker (and the module-scoped assignment below) has real
    // options instead of an empty state.
    for (const moduleName of p.moduleNames) {
      const moduleId = moduleIdByName.get(moduleName);
      if (!moduleId) continue;
      await api(`/projects/${project.id}/modules`, adminToken, { method: "POST", body: { moduleId } });
    }
    console.log(`  + ${p.name}`);
  }

  // CR035 — Aisyah is module-scoped to Portal's "Authentication" module
  // only, demonstrating the "project + module" grant on the Project Access
  // panel (as opposed to everyone else above, who all got whole-project
  // access). She's not on portal-squad and not in directMemberKeys, so this
  // is her only access to the project.
  console.log("\nGranting module-scoped project access...");
  const authModuleId = moduleIdByName.get("Authentication");
  const portalId = projectIdByKey.get("portal");
  if (authModuleId && portalId) {
    await api(`/projects/${portalId}/members`, adminToken, {
      method: "POST", body: { userId: userIdByKey.get("aisyah"), moduleId: authModuleId },
    });
    console.log("  + Aisyah Rahim — Customer Portal Revamp — DEMO (Authentication only)");
  }

  // ── 5. Milestones ─────────────────────────────────────────────────────────
  console.log("\nCreating milestones...");
  const milestoneIdByKey = new Map<string, number>();
  for (const m of MILESTONES) {
    // Completed milestones carrying a closedByKey are created as "active"
    // first, then PATCHed to "completed" by that user — so completedAt and
    // closedBy get stamped through the real transition logic (CR033p1)
    // instead of being backfilled at creation.
    const createAsCompleted = m.status === "completed" && !m.closedByKey;
    const milestone = await api<{ id: number }>("/milestones", adminToken, {
      method: "POST",
      body: {
        projectId: projectIdByKey.get(m.projectKey), name: m.name, type: m.type,
        status: createAsCompleted ? "completed" : (m.status === "completed" ? "active" : m.status),
        targetDate: m.targetDate,
        startDate: m.startDate ?? null,
        reqTargetDate: m.reqTargetDate ?? null,
        devTargetDate: m.devTargetDate ?? null,
        qaTargetDate: m.qaTargetDate ?? null,
        uatTargetDate: m.uatTargetDate ?? null,
        goLiveDate: m.goLiveDate ?? null,
      },
    });
    milestoneIdByKey.set(m.key, milestone.id);
    track("milestone", milestone.id, `${m.name} (${m.projectKey})`);

    if (m.status === "completed" && m.closedByKey) {
      const closerToken = tokenByKey.get(m.closedByKey)!;
      await api(`/milestones/${milestone.id}`, closerToken, {
        method: "PATCH",
        body: { status: "completed", lessonsLearned: m.lessonsLearned ?? null },
      });
    }
    console.log(`  + ${m.name} — ${m.status}, due ${m.targetDate}`);
  }

  // ── 6. Requirements, with the FA review workflow actually exercised ──────
  console.log("\nCreating requirements...");
  const requirementIdByKey = new Map<string, number>();
  const requirementByKey = new Map<string, DemoRequirement>(REQUIREMENTS.map((r) => [r.key, r]));

  // Parents before children, since a child references its parent's real id.
  const ordered = [...REQUIREMENTS].sort((a, b) => (a.parentKey ? 1 : 0) - (b.parentKey ? 1 : 0));

  for (const r of ordered) {
    const authorToken = tokenByKey.get(r.authorKey)!;
    const milestone = MILESTONES.find((m) => m.key === r.milestoneKey)!;
    const created = await api<{ id: number }>("/requirements", authorToken, {
      method: "POST",
      body: {
        title: r.title,
        description: r.description,
        module: r.module,
        projectId: projectIdByKey.get(r.projectKey),
        priority: r.priority,
        status: "open",
        milestoneId: milestoneIdByKey.get(r.milestoneKey),
        parentId: r.parentKey ? requirementIdByKey.get(r.parentKey) : undefined,
        acceptanceCriteria: r.acceptanceCriteria ? JSON.stringify(r.acceptanceCriteria) : undefined,
      },
    });
    requirementIdByKey.set(r.key, created.id);
    track("requirement", created.id, r.title);

    // Submit to review unless this is genuinely un-started work for a
    // planned (future) milestone — those stay as drafts, same as a real FA
    // would leave requirements they haven't gotten to yet.
    const shouldSubmit = r.reviewFlow !== "none" || milestone.status === "active";
    if (!shouldSubmit) continue;

    await api(`/requirements/${created.id}/review`, authorToken, {
      method: "PATCH", body: { action: "submit" },
    });

    if (r.reviewFlow === "approve") {
      const reviewerToken = tokenByKey.get(r.reviewerKey!)!;
      await api(`/requirements/${created.id}/review`, reviewerToken, {
        method: "PATCH", body: { action: "approve" },
      });
    } else if (r.reviewFlow === "reject-then-approve") {
      const reviewerToken = tokenByKey.get(r.reviewerKey!)!;
      await api(`/requirements/${created.id}/review`, reviewerToken, {
        method: "PATCH", body: { action: "reject", comment: r.rejectComment },
      });
      // Author revises the description in response to the reject comment —
      // gives the History panel a real before/after diff to show.
      await api(`/requirements/${created.id}`, authorToken, {
        method: "PATCH",
        body: { description: r.revisedDescription ?? `${r.description} Cart merge rule: if the same item exists in both carts, quantities are summed (capped at available stock).` },
      });
      await api(`/requirements/${created.id}/review`, authorToken, {
        method: "PATCH", body: { action: "submit" },
      });
      await api(`/requirements/${created.id}/review`, reviewerToken, {
        method: "PATCH", body: { action: "approve" },
      });
    } else if (r.reviewFlow === "reject-stay") {
      // Submitted → rejected by reviewer → author has NOT revised.
      // Represents a requirement blocked on a compliance/design question.
      const reviewerToken = tokenByKey.get(r.reviewerKey!)!;
      await api(`/requirements/${created.id}/review`, reviewerToken, {
        method: "PATCH", body: { action: "reject", comment: r.rejectComment },
      });
      // Intentionally stop here — requirement stays in "rejected" state.
    } else if (r.reviewFlow === "approve-then-edit") {
      // Submitted → approved → FA edits description/AC mid-development
      // → requirement goes back to in_review while dev task is still in progress.
      const reviewerToken = tokenByKey.get(r.reviewerKey!)!;
      await api(`/requirements/${created.id}/review`, reviewerToken, {
        method: "PATCH", body: { action: "approve" },
      });
      // Author (FA) discovers the scope needs to change after dev has started —
      // edits their own requirement. Only the author can edit a non-Redmine requirement.
      const rAny = r as any;
      await api(`/requirements/${created.id}`, authorToken, {
        method: "PATCH",
        body: {
          description: rAny.editedDescription ?? `${r.description} [Revised post-approval]`,
          acceptanceCriteria: rAny.editedAcceptanceCriteria
            ? JSON.stringify(rAny.editedAcceptanceCriteria)
            : undefined,
        },
      });
      // Re-submit to review — now back in_review while dev task is blocked.
      await api(`/requirements/${created.id}/review`, authorToken, {
        method: "PATCH", body: { action: "submit" },
      });
      // Intentionally stop here — stays in_review, dev task remains blocked.
    }
    // reviewFlow "none" with shouldSubmit true → stays in_review, unresolved
    // on purpose (feeds the "why this milestone is at risk" story).
  }
  console.log(`  + ${REQUIREMENTS.length} requirements created`);

  // ── 7. Test cases (library) ───────────────────────────────────────────────
  console.log("\nCreating test cases...");
  const tcIdByKey = new Map<string, number>();
  for (const tc of TEST_CASES) {
    const req = requirementByKey.get(tc.requirementKey)!;
    const created = await api<{ id: number; caseId: string }>("/test-cases", adminToken, {
      method: "POST",
      body: {
        title: tc.title,
        preconditions: tc.preconditions,
        testSteps: tc.testSteps,
        expectedResult: tc.expectedResult,
        type: tc.type,
        priority: tc.priority,
        requirementId: requirementIdByKey.get(tc.requirementKey),
        projectId: projectIdByKey.get(req.projectKey),
        module: req.module,
        authorId: userIdByKey.get(tc.authorKey),
        aiAssisted: !!tc.aiAssisted,
      },
    });
    tcIdByKey.set(tc.key, created.id);
    track("testCase", created.id, tc.title);
  }
  console.log(`  + ${TEST_CASES.length} test cases created`);

  // ── 8. Execution files + results ──────────────────────────────────────────
  console.log("\nCreating execution files...");
  // key: `${executionFileKey}:${tcKey}` -> real execution_test_cases row id
  const execRowIdByKey = new Map<string, number>();
  for (const ef of EXECUTION_FILES) {
    const milestone = MILESTONES.find((m) => m.key === ef.milestoneKey)!;
    const file = await api<{ id: number; redmineTicketId: string }>("/execution-files", adminToken, {
      method: "POST",
      body: {
        redmineTicketId: ef.redmineTicketId,
        title: ef.title,
        qaPic: ef.qaPic,
        tracker: ef.tracker,
        projectId: projectIdByKey.get(ef.projectKey),
        milestoneId: milestoneIdByKey.get(ef.milestoneKey),
        fileType: ef.fileType,
      },
    });
    track("executionFile", file.id, ef.title);

    const rows = ef.rows.map((row, idx) => {
      const tc = TEST_CASES.find((t) => t.key === row.tcKey)!;
      const req = requirementByKey.get(tc.requirementKey)!;
      return {
        testCaseId: row.tcKey, // client-supplied stable id, so we can look the row back up by key
        moduleName: req.module,
        libraryTcId: tcIdByKey.get(row.tcKey),
        requirementId: requirementIdByKey.get(tc.requirementKey),
        caseName: tc.title,
        testSteps: tc.testSteps,
        expectedResult: tc.expectedResult,
        result: row.result,
        actualResult: row.actualResult,
        executedAt: row.result === "Not Executed" ? undefined : `${milestone.targetDate}T10:00:00Z`,
        qaPic: ef.qaPic,
        rowOrder: idx,
      };
    });
    await api(`/execution-files/${file.redmineTicketId}/test-cases`, adminToken, {
      method: "POST", body: { testCases: rows, isFullSync: true },
    });

    const savedRows = await api<{ testCases: { id: number; testCaseId: string }[] }>(
      `/execution-files/${file.redmineTicketId}/test-cases`, adminToken,
    );
    for (const row of savedRows.testCases) {
      execRowIdByKey.set(`${ef.key}:${row.testCaseId}`, row.id);
    }
    console.log(`  + ${ef.title} (${ef.rows.length} rows)`);
  }

  // ── 9. Defects ─────────────────────────────────────────────────────────────
  console.log("\nCreating defects...");
  for (const d of DEFECTS) {
    const reporterToken = tokenByKey.get(d.reporterKey)!;
    const executionTcId = d.executionFileKey && d.tcKeyInFile
      ? execRowIdByKey.get(`${d.executionFileKey}:${d.tcKeyInFile}`)
      : undefined;
    const created = await api<{ id: number; defectCode: string }>("/defects", reporterToken, {
      method: "POST",
      body: {
        title: d.title,
        description: d.description,
        stepsToReproduce: d.stepsToReproduce,
        expectedResult: d.expectedResult,
        actualResult: d.actualResult,
        severity: d.severity,
        module: d.module,
        projectId: projectIdByKey.get(d.projectKey),
        foundIn: d.foundIn,
        executionTcId,
        requirementId: d.requirementKey ? requirementIdByKey.get(d.requirementKey) : undefined,
      },
    });
    track("defect", created.id, d.title);

    if (d.source === "production") {
      // POST /defects always creates with source="qa" — flip it + set escape
      // fields via the CR020 escape-review PATCH.
      await api(`/defects/${created.id}`, adminToken, {
        method: "PATCH",
        body: { source: "production", escapeClass: d.escapeClass, escapeStatus: d.escapeStatus },
      });
    }
    if (d.createRegressionTc) {
      await api(`/defects/${created.id}/regression-tc`, adminToken, { method: "POST", body: {} });
    }
    console.log(`  + ${created.defectCode ?? "DEF"}: ${d.title} (${d.severity})`);
  }

  // ── 10. Tasks ──────────────────────────────────────────────────────────────
  console.log("\nCreating tasks...");
  for (const t of TASKS) {
    const created = await api<{ id: number }>("/tasks", adminToken, {
      method: "POST",
      body: {
        name: t.name,
        priority: t.priority,
        status: t.status,
        assigneeIds: t.assigneeKeys.map((k) => userIdByKey.get(k)),
        projectId: projectIdByKey.get(t.projectKey),
        milestoneId: t.milestoneKey ? milestoneIdByKey.get(t.milestoneKey) : undefined,
        requirementId: t.requirementKey ? requirementIdByKey.get(t.requirementKey) : undefined,
        moduleIds: "",
        startDate: t.startDate,
        dueDate: t.dueDate,
        actualStartDate: t.actualStartDate,
        actualEndDate: t.actualEndDate,
        estimatedHours: t.estimatedHours,
        actualHours: t.actualHours,
        completionPercentage: t.completionPercentage,
      },
    });
    track("task", created.id, t.name);
  }
  console.log(`  + ${TASKS.length} tasks created`);

  // ── 11. Risks (CR033p2) ───────────────────────────────────────────────────
  console.log("\nCreating risks...");
  for (const r of RISKS) {
    const raiserToken = tokenByKey.get(r.raisedByKey)!;
    const created = await api<{ id: number }>("/risks", raiserToken, {
      method: "POST",
      body: {
        projectId: projectIdByKey.get(r.projectKey),
        milestoneId: r.milestoneKey ? milestoneIdByKey.get(r.milestoneKey) : null,
        title: r.title,
        description: r.description ?? null,
        category: r.category,
        probability: r.probability,
        impact: r.impact,
        status: r.status,
        mitigationPlan: r.mitigationPlan ?? null,
        ownerId: r.ownerKey ? userIdByKey.get(r.ownerKey) : null,
      },
    });
    track("risk", created.id, r.title);
  }
  console.log(`  + ${RISKS.length} risks created`);

  console.log(`\nDone. ${manifest.length} entities created — see scripts/demo-seed-manifest.json`);
  console.log(`Run "npx tsx src/backdate-demo-activity.ts" next to backdate requirement/activity timestamps — otherwise the PM Dashboard's phase-timeline panel will show "Not enough data yet" (everything above was created via real-time API calls, so every event lands within seconds of "now").`);
  console.log(`Demo login password for all seeded users: ${DEMO_PASSWORD}`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  if (manifest.length > 0) {
    console.error(`Partial progress is saved in demo-seed-manifest.json (${manifest.length} entities) — run "npx tsx src/clear-demo-data.ts" before retrying.`);
  }
  process.exit(1);
});
