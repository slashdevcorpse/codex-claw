import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import {
  activateWorkspace,
  chatQueryKeys,
  createWorkspace,
  deleteWorkspace,
  fetchWorkspaces,
  updateWorkspace,
} from '../chat-queries'
import { readError } from '../utils'
import type {
  PathsPayload,
  WorkspaceListResponse,
  WorkspaceSummary,
} from '../types'

type WorkspaceDraft = Partial<
  Pick<
    WorkspaceSummary,
    | 'id'
    | 'name'
    | 'codexCommand'
    | 'codexSandbox'
    | 'codexWorkdir'
    | 'stateDir'
  >
> & {
  active?: boolean
}

export function useChatSettings() {
  const queryClient = useQueryClient()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pathsLoading, setPathsLoading] = useState(false)
  const [pathsError, setPathsError] = useState<string | null>(null)
  const [paths, setPaths] = useState<PathsPayload | null>(null)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [workspaceActionPending, setWorkspaceActionPending] = useState(false)
  const [workspaceActionError, setWorkspaceActionError] = useState<
    string | null
  >(null)
  const [workspaceData, setWorkspaceData] =
    useState<WorkspaceListResponse | null>(null)

  const invalidateWorkspaceConsumers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.sessions })
    queryClient.invalidateQueries({ queryKey: chatQueryKeys.workspaces })
    queryClient.invalidateQueries({ queryKey: ['chat', 'history'] })
    queryClient.invalidateQueries({ queryKey: ['gateway', 'status'] })
  }, [queryClient])

  const loadPaths = useCallback(async () => {
    setPathsLoading(true)
    try {
      const res = await fetch('/api/paths')
      if (!res.ok) throw new Error(await readError(res))
      const data = (await res.json()) as Partial<PathsPayload>
      setPaths({
        agentId: String(data.agentId ?? 'main'),
        stateDir: String(data.stateDir ?? ''),
        sessionsDir: String(data.sessionsDir ?? ''),
        storePath: String(data.storePath ?? ''),
        workspacesStorePath: String(data.workspacesStorePath ?? ''),
        workspace: data.workspace ?? {
          id: 'default',
          name: 'Default workspace',
          codexCommand: 'codex',
          codexSandbox: 'read-only',
          codexWorkdir: '',
          stateDir: '',
          createdAt: 0,
          updatedAt: 0,
        },
      })
    } catch (err) {
      setPathsError(err instanceof Error ? err.message : String(err))
    } finally {
      setPathsLoading(false)
    }
  }, [])

  const loadWorkspaces = useCallback(async () => {
    setWorkspacesLoading(true)
    try {
      setWorkspacesError(null)
      setWorkspaceData(await fetchWorkspaces())
    } catch (err) {
      setWorkspacesError(err instanceof Error ? err.message : String(err))
    } finally {
      setWorkspacesLoading(false)
    }
  }, [])

  const loadSettingsData = useCallback(async () => {
    setPathsError(null)
    setWorkspacesError(null)
    await Promise.all([loadPaths(), loadWorkspaces()])
  }, [loadPaths, loadWorkspaces])

  const openSettings = useCallback(async () => {
    setSettingsOpen(true)
    if (pathsLoading || workspacesLoading) return
    await loadSettingsData()
  }, [loadSettingsData, pathsLoading, workspacesLoading])

  const handleOpenSettings = useCallback(() => {
    void openSettings()
  }, [openSettings])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const runWorkspaceAction = useCallback(
    async (action: () => Promise<WorkspaceListResponse>) => {
      setWorkspaceActionPending(true)
      setWorkspaceActionError(null)
      try {
        const nextData = await action()
        setWorkspaceData(nextData)
        await loadPaths()
        invalidateWorkspaceConsumers()
      } catch (err) {
        setWorkspaceActionError(
          err instanceof Error ? err.message : String(err),
        )
      } finally {
        setWorkspaceActionPending(false)
      }
    },
    [invalidateWorkspaceConsumers, loadPaths],
  )

  const handleCreateWorkspace = useCallback(
    async (workspace: WorkspaceDraft) => {
      await runWorkspaceAction(() => createWorkspace(workspace))
    },
    [runWorkspaceAction],
  )

  const handleUpdateWorkspace = useCallback(
    async (workspace: WorkspaceDraft & { id: string }) => {
      await runWorkspaceAction(() => updateWorkspace(workspace))
    },
    [runWorkspaceAction],
  )

  const handleActivateWorkspace = useCallback(
    async (id: string) => {
      await runWorkspaceAction(() => activateWorkspace(id))
    },
    [runWorkspaceAction],
  )

  const handleDeleteWorkspace = useCallback(
    async (id: string) => {
      await runWorkspaceAction(() => deleteWorkspace(id))
    },
    [runWorkspaceAction],
  )

  const copySessionsDir = useCallback(() => {
    if (!paths?.sessionsDir) return
    try {
      void navigator.clipboard.writeText(paths.sessionsDir)
    } catch {
      // ignore
    }
  }, [paths])

  const copyStorePath = useCallback(() => {
    if (!paths?.storePath) return
    try {
      void navigator.clipboard.writeText(paths.storePath)
    } catch {
      // ignore
    }
  }, [paths])

  const copyFixCommand = useCallback((command: string) => {
    try {
      void navigator.clipboard.writeText(command)
    } catch {
      // ignore
    }
  }, [])

  return {
    settingsOpen,
    setSettingsOpen,
    pathsLoading,
    pathsError,
    paths,
    workspacesLoading,
    workspacesError,
    workspaceActionPending,
    workspaceActionError,
    workspaceData,
    handleOpenSettings,
    closeSettings,
    copySessionsDir,
    copyStorePath,
    copyFixCommand,
    createWorkspace: handleCreateWorkspace,
    updateWorkspace: handleUpdateWorkspace,
    activateWorkspace: handleActivateWorkspace,
    deleteWorkspace: handleDeleteWorkspace,
  }
}
