import { memo } from "react"
import { GripVertical } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const GripVerticalIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <GripVertical
      aria-hidden="true"
      className={className}
      strokeWidth={1.8}
      {...props}
    />
  )
})

GripVerticalIcon.displayName = "GripVerticalIcon"
