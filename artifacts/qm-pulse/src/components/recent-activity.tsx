import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getRecentActivity, getRecentActivityOptions } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

export function RecentActivity() {
  const { user } = useAuth();
  const [project, setProject] = useState('');
  const [member, setMember] = useState('');
  const [mode, setMode] = useState<'project' | 'mine'>('project');
  const options = useQuery({
    queryKey: ['activity-options', user?.id, project],
    queryFn: ({ signal }) => getRecentActivityOptions(project ? { projectId: Number(project) } : {}, { signal }),
    enabled: !!user, refetchOnWindowFocus: true,
  });
  const actor = mode === 'mine' ? String(user?.id ?? '') : member;
  const feed = useInfiniteQuery({
    queryKey: ['recent-activity', user?.id, project, actor],
    initialPageParam: '',
    queryFn: async ({ pageParam, signal }) => {
      const items = await getRecentActivity({ limit: 6,
        projectId: project ? Number(project) : undefined,
        userId: actor ? Number(actor) : undefined,
        cursor: pageParam || undefined,
      }, { signal });
      return { items: items.slice(0, 5), next: items.length > 5 ? items[4].cursor : undefined };
    },
    getNextPageParam: page => page.next,
    enabled: !!user && options.isSuccess,
    refetchInterval: 60_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true,
  });
  const items = feed.data?.pages.flatMap(page => page.items) ?? [];
  const busy = options.isFetching || feed.isFetching;
  const selectClass = 'h-9 rounded-md border bg-background px-2 text-sm w-full';
  return <Card className="col-span-1">
    <CardHeader>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Recent Activity</CardTitle>
        <Button variant="ghost" size="sm" aria-label="Refresh recent activity" disabled={busy} onClick={() => { void options.refetch(); void feed.refetch(); }}>
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <CardDescription>Work updates in projects you can access. Updates every minute.</CardDescription>
      <div className="flex gap-2 pt-2">
        <Button size="sm" variant={mode === 'project' ? 'default' : 'outline'} aria-pressed={mode === 'project'} onClick={() => setMode('project')}>Project activity</Button>
        <Button size="sm" variant={mode === 'mine' ? 'default' : 'outline'} aria-pressed={mode === 'mine'} onClick={() => setMode('mine')}>My activity</Button>
      </div>
      <label className="text-xs space-y-1"><span>Project</span>
        <select aria-label="Activity project" className={selectClass} value={project} onChange={e => { setProject(e.target.value); setMember(''); }}>
          <option value="">All accessible projects</option>
          {options.data?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {mode === 'project' && (options.data?.members.length ?? 0) > 1 && <label className="text-xs space-y-1"><span>Member</span>
        <select aria-label="Activity member" className={selectClass} value={member} onChange={e => setMember(e.target.value)}>
          <option value="">All project members</option>
          {options.data?.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>}
    </CardHeader>
    <CardContent className="space-y-4" aria-live="polite">
      {(options.isError || feed.isError) && <p role="alert" className="text-sm text-destructive">Activity could not be loaded. Use Refresh to try again.</p>}
      {(options.isPending || feed.isPending) && !options.isError && <p className="text-sm text-muted-foreground">Loading activity…</p>}
      {!options.isError && !feed.isError && !feed.isPending && items.length === 0 && <p className="text-sm text-muted-foreground">No activity matches these filters.</p>}
      {!options.isError && !feed.isError && items.map(item => <div key={item.id} className="space-y-1 border-b pb-3 last:border-0">
        <p className="text-sm font-medium">{item.userName ?? 'System'}</p>
        {item.href ? <Link href={item.href} className="text-sm text-primary hover:underline break-words">{item.description}</Link> : <p className="text-sm">{item.description}</p>}
        <p className="text-xs text-muted-foreground">{item.projectName} · <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{new Date(item.createdAt).toLocaleString()}</time></p>
      </div>)}
      {feed.hasNextPage && !feed.isError && <Button variant="outline" size="sm" disabled={busy} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? 'Loading…' : 'View more'}</Button>}
    </CardContent>
  </Card>;
}
