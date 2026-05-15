import { memo } from "react"
import { Plus } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const PlusIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <Plus
      aria-hidden="true"
      className={className}
      strokeWidth={1.9}
      {...props}
    />
  )
})

PlusIcon.displayName = "PlusIcon"
