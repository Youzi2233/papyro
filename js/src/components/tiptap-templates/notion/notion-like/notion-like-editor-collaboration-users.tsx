"use client"

import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { getAvatar } from "@/lib/tiptap-collab-utils"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarImage,
} from "@/components/tiptap-ui-primitive/avatar"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"

type User = { clientId: number; id: string; name: string; color: string }

export function CollaborationUsers() {
  const { editor } = useTiptapEditor()

  if (!editor || !editor.storage.collaborationCaret) {
    return null
  }

  const collaborationUsers: User[] =
    editor.storage.collaborationCaret.users.map((user) => ({
      clientId: user.clientId,
      id: String(user.clientId),
      name: user.name || "Anonymous",
      color: user.color || "#000000",
    }))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          data-appearence="subdued"
          style={{ padding: "0.25rem" }}
        >
          <AvatarGroup maxVisible={3}>
            {collaborationUsers.map((user) => (
              <Avatar key={user.id} userColor={user.color}>
                <AvatarImage src={getAvatar(user.name)} />
                <AvatarFallback>{user.name?.toUpperCase()[0]}</AvatarFallback>
              </Avatar>
            ))}
          </AvatarGroup>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          {collaborationUsers.map((user) => (
            <DropdownMenuItem key={user.id} asChild>
              <Button variant="ghost">
                <Avatar userColor={user.color}>
                  <AvatarImage src={getAvatar(user.name)} />
                  <AvatarFallback>{user.name?.toUpperCase()[0]}</AvatarFallback>
                </Avatar>
                <span className="tiptap-button-text">{user.name}</span>
              </Button>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
