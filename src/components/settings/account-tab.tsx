"use client"

import { useState } from "react"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { User, Key, Edit2 } from "lucide-react"

export function AccountTab() {
  const { data: session } = useSession()
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  })
  const [usernameData, setUsernameData] = useState({
    newUsername: "",
    password: ""
  })
  const [submitting, setSubmitting] = useState(false)
  const [submittingUsername, setSubmittingUsername] = useState(false)

  async function handleUsernameChange(e: React.FormEvent) {
    e.preventDefault()

    if (!usernameData.newUsername || !usernameData.password) {
      toast.error("Please fill in all fields")
      return
    }

    if (usernameData.newUsername.length < 3) {
      toast.error("Username must be at least 3 characters")
      return
    }

    setSubmittingUsername(true)

    try {
      const res = await fetch("/api/settings/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newUsername: usernameData.newUsername,
          password: usernameData.password
        })
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to change username")
        return
      }

      toast.success("Username changed successfully. Please login again.")
      setUsernameData({ newUsername: "", password: "" })

      // Sign out to force re-login with new username
      setTimeout(() => {
        signOut({ callbackUrl: "/login" })
      }, 1500)
    } catch {
      toast.error("Failed to change username")
    } finally {
      setSubmittingUsername(false)
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()
    console.log("handlePasswordChange called", passwordData)

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords do not match")
      return
    }

    if (passwordData.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    setSubmitting(true)

    try {
      console.log("Sending password change request...")
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      })

      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || "Failed to change password")
        return
      }

      toast.success("Password changed successfully")
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" })
    } catch {
      toast.error("Failed to change password")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>Account</CardTitle>
          </div>
          <CardDescription>Your account information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={session?.user?.name || ""} disabled />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Input value={session?.user?.role || "admin"} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>Change Password</CardTitle>
          </div>
          <CardDescription>Update your password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Changing..." : "Change Password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            <CardTitle>Change Username</CardTitle>
          </div>
          <CardDescription>Update your username (requires re-login)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUsernameChange} className="space-y-4">
            <div className="space-y-2">
              <Label>New Username</Label>
              <Input
                type="text"
                value={usernameData.newUsername}
                onChange={(e) => setUsernameData({ ...usernameData, newUsername: e.target.value })}
                placeholder="Enter new username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={usernameData.password}
                onChange={(e) => setUsernameData({ ...usernameData, password: e.target.value })}
                placeholder="Confirm with your password"
                required
              />
            </div>
            <Button type="submit" disabled={submittingUsername}>
              {submittingUsername ? "Changing..." : "Change Username"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
