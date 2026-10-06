import { useCallback, useEffect, useState } from "react";
import { fetchAssignableContacts, type RedmineMember } from "@/lib/execution-api";

/** The defect Assignee list: Redmine contacts, QM Pulse users first. Shared by both defect dialogs. */
export function useAssignableContacts(open: boolean) {
  const [members, setMembers] = useState<RedmineMember[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    fetchAssignableContacts()
      .then(setMembers)
      .catch((e) => setLoadError(e?.message ?? "Could not load assignees"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  return { members, loadError, loading, reload };
}

export const assigneeOptions = (members: RedmineMember[]) =>
  members.map((m) => ({ value: m.id.toString(), label: m.userId == null ? `${m.name} (Redmine only)` : m.name }));
