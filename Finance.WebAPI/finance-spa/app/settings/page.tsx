"use client"

import { useEffect, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { UserPreferencesPanel } from "@/components/user-preferences-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { Button } from "@/components/ui/button"
import { createUser, deleteUser, getUsers, updateUserAdmin } from "@/lib/users"
import { type CreateUserInput, type User } from "@/models/user"

export default function SettingsPage() {
  const { user } = useAuth()
  const { confirm } = useConfirmationDialog()
  const { showSnackbar } = useSnackbar()
  const [users, setUsers] = useState<User[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isUpdatingUserId, setIsUpdatingUserId] = useState<string | null>(null)
  const [isDeletingUserId, setIsDeletingUserId] = useState<string | null>(null)
  const [newUser, setNewUser] = useState<CreateUserInput>({
    email: "",
    displayName: "",
    password: "",
    isAdmin: false,
  })

  useEffect(() => {
    if (!user?.isAdmin) {
      setUsers([])
      return
    }

    let isMounted = true

    async function loadUsers() {
      setIsLoadingUsers(true)

      try {
        const nextUsers = await getUsers()
        if (isMounted) {
          setUsers(nextUsers)
        }
      } catch (error) {
        if (isMounted) {
          showSnackbar({
            message: error instanceof Error ? error.message : "Failed to load users.",
            tone: "error",
          })
        }
      } finally {
        if (isMounted) {
          setIsLoadingUsers(false)
        }
      }
    }

    void loadUsers()

    return () => {
      isMounted = false
    }
  }, [showSnackbar, user?.isAdmin])

  async function handleCreateUser() {
    setIsCreatingUser(true)

    try {
      const createdUser = await createUser(newUser)
      setUsers((current) => [...current, createdUser].sort((left, right) => left.email.localeCompare(right.email)))
      setNewUser({
        email: "",
        displayName: "",
        password: "",
        isAdmin: false,
      })
      showSnackbar({ message: "User created.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to create user.",
        tone: "error",
      })
    } finally {
      setIsCreatingUser(false)
    }
  }

  async function handleToggleAdmin(targetUser: User) {
    setIsUpdatingUserId(targetUser.id)

    try {
      const updatedUser = await updateUserAdmin(targetUser.id, !targetUser.isAdmin)
      setUsers((current) =>
        current
          .map((item) => (item.id === updatedUser.id ? updatedUser : item))
          .sort((left, right) => left.email.localeCompare(right.email)),
      )
      showSnackbar({
        message: updatedUser.isAdmin ? "Admin access granted." : "Admin access removed.",
        tone: "success",
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to update admin access.",
        tone: "error",
      })
    } finally {
      setIsUpdatingUserId(null)
    }
  }

  async function handleDeleteUser(targetUser: User) {
    const shouldDelete = await confirm({
      title: "Delete user",
      message: `Delete ${targetUser.email}? This action cannot be undone.`,
      confirmLabel: "Delete user",
      cancelLabel: "Cancel",
      variant: "destructive",
    })

    if (!shouldDelete) {
      return
    }

    setIsDeletingUserId(targetUser.id)

    try {
      await deleteUser(targetUser.id)
      setUsers((current) => current.filter((item) => item.id !== targetUser.id))
      showSnackbar({ message: "User deleted.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to delete user.",
        tone: "error",
      })
    } finally {
      setIsDeletingUserId(null)
    }
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Global preferences for formatting and presentation"
    >
      <UserPreferencesPanel />

      {user?.isAdmin ? (
        <section className="max-w-5xl rounded-2xl border bg-card p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Admin</h2>
            <p className="text-sm text-muted-foreground">
              Manage application users and grant admin access where required.
            </p>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-2xl border bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Users</h3>
                  <p className="text-sm text-muted-foreground">Current application users.</p>
                </div>
                {isLoadingUsers ? <span className="text-xs text-muted-foreground">Loading...</span> : null}
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">User</th>
                      <th className="px-3 py-2 font-medium">Role</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((item) => (
                      <tr key={item.id} className="border-t">
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium">{item.displayName}</div>
                          <div className="text-xs text-muted-foreground">{item.email}</div>
                          {item.isSuperUser ? (
                            <div className="mt-1 text-[11px] font-medium text-primary">Bootstrap super user</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top">
                          {item.isSuperUser ? "Super user" : item.isAdmin ? "Admin" : "User"}
                        </td>
                        <td className="px-3 py-3 align-top">{item.isActive ? "Active" : "Inactive"}</td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                item.isSuperUser ||
                                isUpdatingUserId === item.id ||
                                isDeletingUserId === item.id
                              }
                              onClick={() => void handleToggleAdmin(item)}
                            >
                              {item.isSuperUser
                                ? "Protected"
                                : isUpdatingUserId === item.id
                                  ? "Saving..."
                                  : item.isAdmin
                                    ? "Remove admin"
                                    : "Make admin"}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={
                                item.isSuperUser ||
                                isDeletingUserId === item.id ||
                                isUpdatingUserId === item.id
                              }
                              onClick={() => void handleDeleteUser(item)}
                            >
                              {item.isSuperUser
                                ? "Protected"
                                : isDeletingUserId === item.id
                                  ? "Deleting..."
                                  : "Delete"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!isLoadingUsers && users.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-sm text-muted-foreground">
                          No users found.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-2xl border bg-background/70 p-4">
              <h3 className="font-semibold">Add user</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a new login with its own password and optional admin access.
              </p>

              <div className="mt-4 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Display name</span>
                  <input
                    value={newUser.displayName}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, displayName: event.target.value }))
                    }
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Email</span>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, email: event.target.value }))
                    }
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium">Password</span>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, password: event.target.value }))
                    }
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">
                    Must be at least 8 characters.
                  </span>
                </label>

                <label className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newUser.isAdmin}
                    onChange={(event) =>
                      setNewUser((current) => ({ ...current, isAdmin: event.target.checked }))
                    }
                    className="size-4"
                  />
                  <span>Grant admin access</span>
                </label>

                <div className="flex justify-end">
                  <Button type="button" onClick={() => void handleCreateUser()} disabled={isCreatingUser}>
                    {isCreatingUser ? "Creating..." : "Create user"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </AppShell>
  )
}
