import { cn } from "@/lib/tiptap-utils"
import "./textarea.scss"

function Textarea({
  className,
  ...props
}) {
  return (<textarea data-slot="textarea" className={cn("textarea", className)} {...props} />);
}

export { Textarea }
