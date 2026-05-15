import { memo } from "react"
import { MoreVertical } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const MoreVerticalIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <MoreVertical
      aria-hidden="true"
      className={className}
      strokeWidth={1.8}
      {...props}
    />
  )
})

MoreVerticalIcon.displayName = "MoreVerticalIcon"
