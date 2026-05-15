import { memo } from "react"
import { AlignHorizontalDistributeCenter } from "lucide-react"

type SvgProps = React.ComponentPropsWithoutRef<"svg">

export const AlignmentIcon = memo(({ className, ...props }: SvgProps) => {
  return (
    <AlignHorizontalDistributeCenter
      aria-hidden="true"
      className={className}
      strokeWidth={1.8}
      {...props}
    />
  )
})

AlignmentIcon.displayName = "AlignmentIcon"
